/**
 * `dsh-observe` — the observability exporter for DeepSeek Harness: turns
 * the `session/event` stream into OTLP/HTTP traces + metrics and Langfuse
 * observations. Turn/step lifecycle spans, tool-call spans (duration,
 * status, derived retries), LLM generation spans with sanitized
 * prompt/completion, and per-model token and cost metrics; async batching,
 * a bounded durable offline buffer (storage-domain), retry with backoff,
 * and a pre-send sanitization layer. Off by default — `enabled: true` plus
 * at least one backend is an explicit opt-in.
 *
 * Function plugin — no default export (the Loader unwraps
 * `exports.default ?? exports`, and a stray default would discard
 * `name`/`inject`/`Config`/`apply`).
 * @module dsh-observe
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { Config, resolveConfig } from './config.ts'
import type { ExportRecord, MetricRecord, SpanRecord } from './model.ts'
import { observeDomainSpec, openSpool } from './spool.ts'
import { OtlpSink, LangfuseSink } from './sinks.ts'
import { Pipeline } from './pipeline.ts'
import { Collector } from './collector.ts'
import type { TokenMeterService } from './collector.ts'
import { observeRemotePlugin } from './remote.ts'
import type { ObserveStatus } from './wire.ts'

export const name = 'observe'
/** The durable offline buffer needs the host's storage-domain facility. */
export const inject = ['storageDomain']

export { Config, resolveConfig } from './config.ts'
export type { ResolvedConfig, PricingRule, SanitizeConfig, BatchConfig, RetryConfig, OtlpConfig, LangfuseConfig } from './config.ts'
export { VERSION } from './version.ts'
export { REDACTED, sanitizeJson, sanitizeJsonText, sanitizeText, truncate } from './sanitize.ts'
export type { SpanRecord, MetricRecord, ExportRecord, TokenCounts, SpanKind } from './model.ts'
export type { ObserveStatus, ObserveSetEnabledResult } from './wire.ts'

/**
 * Mount the exporter. The resolved config is validated first (fail loud);
 * with `enabled: false` the plugin registers nothing and stays inert.
 * @param ctx - the plugin context (host).
 * @param config - raw plugin config.
 * @returns resolution after the offline-buffer domain is open.
 */
export async function apply(ctx: Context, config: Config = {}): Promise<void> {
  const resolved = resolveConfig(config)
  const logger = ctx.logger('observe')
  if (!resolved.enabled) {
    logger.info('disabled: enabled is false — no session data is captured or exported')
    return
  }

  // The runtime kill switch, flippable through the optional Typert remote.
  let enabled = true
  const isEnabled = () => enabled

  const otlpSink = resolved.otlp === undefined ? undefined : new OtlpSink(resolved.otlp, logger)
  const recordMetric = (metric: MetricRecord): void => {
    if (isEnabled()) otlpSink?.recordMetric(metric)
  }

  const domain = await ctx.storageDomain.open(observeDomainSpec)
  const spool = openSpool(
    domain,
    resolved.batch.maxBufferRecords,
    count => recordMetric({
      name: 'observe.dropped',
      kind: 'counter',
      unit: 'records',
      value: count,
      attributes: { reason: 'buffer_overflow' },
    }),
    count => {
      logger.warn(`spool: ${count} stored record(s) failed validation and were dropped`)
    },
  )

  const pipelines: Pipeline[] = []
  if (otlpSink !== undefined) {
    pipelines.push(new Pipeline({
      name: 'otlp',
      sink: otlpSink,
      spool,
      batch: resolved.batch,
      retry: resolved.retry,
      logger,
      isEnabled,
      onMetric: recordMetric,
    }))
  }
  if (resolved.langfuse !== undefined) {
    pipelines.push(new Pipeline({
      name: 'langfuse',
      sink: new LangfuseSink(resolved.langfuse, logger),
      spool,
      batch: resolved.batch,
      retry: resolved.retry,
      logger,
      isEnabled,
      onMetric: recordMetric,
    }))
  }

  const onSpan = (span: SpanRecord): void => {
    const record: ExportRecord = { kind: 'span', span }
    for (const pipeline of pipelines) pipeline.push(record)
  }

  const collector = new Collector(
    resolved,
    () => ctx.get('tokenMeter') as unknown as TokenMeterService | undefined,
    onSpan,
    recordMetric,
    logger,
  )

  // One effect owns every timer and the teardown order: stop the timers,
  // final-flush the pipelines (spilling failures to the durable buffer),
  // then close the domain.
  ctx.effect(() => {
    const timers: ReturnType<typeof setInterval>[] = [
      setInterval(() => {
        for (const pipeline of pipelines) void pipeline.tick()
      }, resolved.batch.flushIntervalMs),
      setInterval(() => {
        for (const pipeline of pipelines) void pipeline.drainSpool()
      }, resolved.batch.bufferRetryIntervalMs),
      ...(otlpSink === undefined
        ? []
        : [setInterval(() => { void otlpSink.flushMetrics() }, resolved.batch.flushIntervalMs)]),
    ]
    return async () => {
      for (const timer of timers) clearInterval(timer)
      await Promise.all(pipelines.map(pipeline => pipeline.dispose()))
      await domain.close()
    }
  })

  ctx.on('session/event', (session: Session, event: SessionEvent) => {
    try {
      collector.handleEvent(session, event)
    } catch (error) {
      logger.warn(`session "${session.id}": event handling failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  })

  // Best-effort kick: the session-flush durability checkpoint must not wait
  // on a remote observability backend, so exports run in the background.
  ctx.on('session/flush', () => {
    for (const pipeline of pipelines) pipeline.kick()
  })

  ctx.on('session/disposed', (session: Session) => {
    try {
      collector.handleSessionDisposed(session)
    } catch (error) {
      logger.warn(`session "${session.id}": disposal handling failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    for (const pipeline of pipelines) pipeline.kick()
  })

  if (resolved.remote) {
    const depthOf = (backend: 'otlp' | 'langfuse'): number =>
      pipelines.find(pipeline => pipeline.name === backend)?.depth ?? 0
    await ctx.plugin(observeRemotePlugin({
      getStatus: (): ObserveStatus => ({
        enabled,
        backends: {
          otlp: resolved.otlp !== undefined,
          langfuse: resolved.langfuse !== undefined,
        },
        queueDepth: { otlp: depthOf('otlp'), langfuse: depthOf('langfuse') },
        spool: spool.counts(),
      }),
      setEnabled: (value: boolean) => {
        enabled = value
        logger.info(value ? 'exporting re-enabled' : 'exporting disabled (kill switch): new records are dropped until re-enabled')
        if (value) {
          for (const pipeline of pipelines) pipeline.kick()
        }
      },
    }))
  }
}
