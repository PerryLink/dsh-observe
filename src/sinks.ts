/**
 * Export sinks: the OTLP/HTTP backend (traces + metrics, JSON encoding)
 * and the Langfuse ingestion backend. Sinks receive only owned, sanitized
 * {@link ExportRecord}s and translate them to wire payloads; they own no
 * harness state.
 * @module dsh-observe/sinks
 */

import type { Logger } from '@deepseek-ai/cordis'
import type { ResolvedLangfuse, ResolvedOtlp } from './config.ts'
import type { ExportRecord, JsonScalar, MetricRecord, SpanRecord, TokenCounts } from './model.ts'
import { langfuseId, langfuseTraceId, otelSpanId, otelTraceId } from './ids.ts'
import { VERSION } from './version.ts'

/** The observable logging surface consumed by sinks, pipelines, and the collector. */
export type ObserveLogger = Pick<Logger, 'info' | 'warn' | 'error'>

/** One span sink: consumes span records and delivers them to its backend. */
export interface SpanSink {
  readonly name: 'otlp' | 'langfuse'
  exportSpans(records: readonly ExportRecord[]): Promise<void>
}

/** POST a JSON body with a timeout; throws on non-2xx. */
async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) {
    throw new Error(`${url} responded ${response.status} ${response.statusText}`)
  }
}

/** Encode one attribute value in OTLP/JSON form. */
function otlpValue(value: JsonScalar): Record<string, unknown> {
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { boolValue: value }
  if (Number.isInteger(value)) return { intValue: String(value) }
  return { doubleValue: value }
}

/** Encode one key/value pair as an OTLP/JSON attribute. */
function otlpAttribute(key: string, value: JsonScalar): Record<string, unknown> {
  return { key, value: otlpValue(value) }
}

/** OTel span status code. */
const STATUS_CODE_OK = 1
const STATUS_CODE_ERROR = 2

/** OTel span kind: INTERNAL. */
const SPAN_KIND_INTERNAL = 1

/** Name of one span record, shared by both backends. */
function spanName(span: SpanRecord): string {
  switch (span.kind) {
    case 'turn': return `turn ${span.turn}`
    case 'step': return `step ${span.turn}.${String(span.step)}`
    case 'tool': return `tool ${span.tool?.name ?? 'unknown'}`
    case 'llm': return 'llm.request'
  }
}

/** OTel span id of one span record. */
function spanIdOf(span: SpanRecord): string {
  switch (span.kind) {
    case 'turn': return otelSpanId(span.sessionId, span.turn, 'turn')
    case 'step': return otelSpanId(span.sessionId, span.turn, span.step ?? -1, 'step')
    case 'tool': return otelSpanId(span.sessionId, span.turn, span.step ?? -1, span.callId ?? 'tool')
    case 'llm': return otelSpanId(span.sessionId, span.turn, span.step ?? -1, 'llm')
  }
}

/** Parent OTel span id of one span record (step/tool/llm parent under their step span). */
function parentSpanIdOf(span: SpanRecord): string | undefined {
  if (span.kind === 'turn') return undefined
  return otelSpanId(span.sessionId, span.turn, span.step ?? -1, 'step')
}

/** ISO-8601 timestamp of Unix nanoseconds (Langfuse wire format). */
function isoTimestamp(unixNano: number): string {
  return new Date(Math.floor(unixNano / 1_000_000)).toISOString()
}

/** One span in OTLP/JSON wire form. */
function otlpSpan(span: SpanRecord): Record<string, unknown> {
  const attributes = Object.entries(span.attributes).map(([key, value]) => otlpAttribute(key, value))
  if (span.tool !== undefined) {
    attributes.push(otlpAttribute('tool.name', span.tool.name))
    attributes.push(otlpAttribute('tool.status', span.tool.status))
    attributes.push(otlpAttribute('tool.attempt', span.tool.attempt))
    attributes.push(otlpAttribute('tool.retries', span.tool.retries))
    if (span.tool.input !== undefined) attributes.push(otlpAttribute('tool.input', span.tool.input))
    if (span.tool.output !== undefined) attributes.push(otlpAttribute('tool.output', span.tool.output))
    if (span.tool.errorName !== undefined) attributes.push(otlpAttribute('tool.error.name', span.tool.errorName))
    if (span.tool.errorCode !== undefined) attributes.push(otlpAttribute('tool.error.code', span.tool.errorCode))
  }
  if (span.llm !== undefined) {
    if (span.llm.model !== undefined) attributes.push(otlpAttribute('llm.model', span.llm.model))
    if (span.llm.provider !== undefined) attributes.push(otlpAttribute('llm.provider', span.llm.provider))
    if (span.llm.finishReason !== undefined) attributes.push(otlpAttribute('llm.finish_reason', span.llm.finishReason))
    if (span.llm.ttftMs !== undefined) attributes.push(otlpAttribute('llm.ttft_ms', span.llm.ttftMs))
    if (span.llm.costUsd !== undefined) attributes.push(otlpAttribute('llm.cost_usd', span.llm.costUsd))
    for (const [key, value] of usageAttributes(span.llm.usage)) {
      attributes.push(otlpAttribute(key, value))
    }
  }
  const events = []
  if (span.llm?.input !== undefined) {
    events.push({ name: 'gen_ai.prompt', attributes: [otlpAttribute('gen_ai.prompt', span.llm.input)] })
  }
  if (span.llm?.output !== undefined) {
    events.push({ name: 'gen_ai.completion', attributes: [otlpAttribute('gen_ai.completion', span.llm.output)] })
  }
  const error = span.status === 'error'
  return {
    traceId: otelTraceId(span.sessionId, span.turn),
    spanId: spanIdOf(span),
    ...(parentSpanIdOf(span) === undefined ? {} : { parentSpanId: parentSpanIdOf(span) }),
    name: spanName(span),
    kind: SPAN_KIND_INTERNAL,
    startTimeUnixNano: String(span.startUnixNano),
    endTimeUnixNano: String(span.endUnixNano),
    attributes,
    events,
    status: { code: error ? STATUS_CODE_ERROR : STATUS_CODE_OK, message: error ? spanError(span) : '' },
  }
}

/** Flatten usage counts to `usage.*` attributes. */
function usageAttributes(usage: TokenCounts | undefined): [string, number][] {
  if (usage === undefined) return []
  return [
    ['usage.input_tokens', usage.input],
    ['usage.output_tokens', usage.output],
    ['usage.cache_read_tokens', usage.cacheRead],
    ['usage.cache_write_tokens', usage.cacheWrite],
    ['usage.reasoning_tokens', usage.reasoning],
  ]
}

/** Error message for a failed span's status. */
function spanError(span: SpanRecord): string {
  if (span.tool?.errorCode !== undefined) return `tool ${span.tool.name}: ${span.tool.errorCode}`
  if (span.tool !== undefined) return `tool ${span.tool.name}: aborted`
  return 'span closed with error status'
}

/** A stable key for one metric aggregation: JSON over name + sorted attributes. */
function metricKey(metric: MetricRecord): string {
  const attributes = Object.fromEntries(Object.entries(metric.attributes).sort(([left], [right]) => left.localeCompare(right)))
  return JSON.stringify({ name: metric.name, attributes })
}

/** Parse a metric aggregation key back into name + attributes. */
function parseMetricKey(key: string): { name: string; attributes: Record<string, string> } {
  const parsed = JSON.parse(key) as { name: string; attributes: Record<string, string> }
  return { name: parsed.name, attributes: parsed.attributes }
}

/** An OTLP/JSON metric attribute (string values only). */
function otlpMetricAttributes(attributes: Record<string, string>): Record<string, unknown>[] {
  return Object.entries(attributes).map(([key, value]) => otlpAttribute(key, value))
}

/** OTel aggregation temporality: cumulative. */
const AGGREGATION_TEMPORALITY_CUMULATIVE = 2

/**
 * The OTLP/HTTP backend. Spans POST to `{endpoint}/v1/traces`; metrics are
 * aggregated here into cumulative counters (and last-write-wins gauges) and
 * POSTed to `{endpoint}/v1/metrics` by a periodic flush. Cumulative
 * counters make a lost metric flush self-healing — the next flush carries
 * the totals — which is why metrics intentionally bypass the retry/spool
 * pipeline that protects spans.
 */
export class OtlpSink implements SpanSink {
  readonly name = 'otlp' as const

  private readonly counters = new Map<string, { startUnixNano: number; value: number }>()
  private readonly gauges = new Map<string, number>()
  private metricsDirty = false

  /**
   * @param config - the resolved OTLP backend config.
   * @param logger - the plugin logger.
   */
  constructor(
    private readonly config: ResolvedOtlp,
    private readonly logger: ObserveLogger,
  ) {}

  /**
   * Fold one metric sample into the aggregation state. Counters accumulate
   * deltas from the first-seen timestamp; gauges replace per key.
   * @param metric - the sample.
   */
  recordMetric(metric: MetricRecord): void {
    if (metric.kind === 'counter') {
      const key = metricKey(metric)
      const entry = this.counters.get(key)
      if (entry === undefined) {
        this.counters.set(key, { startUnixNano: Date.now() * 1_000_000, value: metric.value })
      } else {
        entry.value += metric.value
      }
    } else {
      this.gauges.set(metricKey(metric), metric.value)
    }
    this.metricsDirty = true
  }

  /**
   * Send the aggregated metrics if anything changed since the last flush.
   * A failed flush re-flags the state through the failure counter, so the
   * next cycle retries with the cumulative totals.
   * @returns resolution after the POST (or immediately when clean).
   */
  async flushMetrics(): Promise<void> {
    if (!this.metricsDirty) return
    this.metricsDirty = false
    const timeUnixNano = Date.now() * 1_000_000
    const metrics: Record<string, unknown>[] = []
    for (const [key, entry] of this.counters) {
      const { name, attributes } = parseMetricKey(key)
      metrics.push({
        name,
        unit: unitOf(name),
        sum: {
          dataPoints: [{
            attributes: otlpMetricAttributes(attributes),
            startTimeUnixNano: String(entry.startUnixNano),
            timeUnixNano: String(timeUnixNano),
            ...(Number.isInteger(entry.value) ? { asInt: String(entry.value) } : { asDouble: entry.value }),
          }],
          aggregationTemporality: AGGREGATION_TEMPORALITY_CUMULATIVE,
          isMonotonic: true,
        },
      })
    }
    for (const [key, value] of this.gauges) {
      const { name, attributes } = parseMetricKey(key)
      metrics.push({
        name,
        unit: unitOf(name),
        gauge: {
          dataPoints: [{
            attributes: otlpMetricAttributes(attributes),
            startTimeUnixNano: String(timeUnixNano),
            timeUnixNano: String(timeUnixNano),
            ...(Number.isInteger(value) ? { asInt: String(value) } : { asDouble: value }),
          }],
        },
      })
    }
    try {
      await postJson(
        `${this.config.endpoint}/v1/metrics`,
        this.config.headers,
        { resourceMetrics: [{ resource: this.resource(), scopeMetrics: [{ scope: this.scope(), metrics }] }] },
        this.config.timeoutMs,
      )
    } catch (error) {
      this.logger.warn(`otlp: metrics flush failed: ${error instanceof Error ? error.message : String(error)}`)
      this.recordMetric({
        name: 'observe.export_failures',
        kind: 'counter',
        unit: 'requests',
        value: 1,
        attributes: { backend: 'otlp', kind: 'metrics' },
      })
    }
  }

  async exportSpans(records: readonly ExportRecord[]): Promise<void> {
    const spans = records.flatMap(record => record.kind === 'span' ? [record.span] : [])
    if (spans.length === 0) return
    await postJson(
      `${this.config.endpoint}/v1/traces`,
      this.config.headers,
      {
        resourceSpans: [{
          resource: this.resource(),
          scopeSpans: [{ scope: this.scope(), spans: spans.map(otlpSpan) }],
        }],
      },
      this.config.timeoutMs,
    )
  }

  /** The OTel resource (service identity). */
  private resource(): Record<string, unknown> {
    const attributes = [
      otlpAttribute('service.name', this.config.serviceName),
      ...(this.config.serviceVersion === undefined
        ? []
        : [otlpAttribute('service.version', this.config.serviceVersion)]),
    ]
    return { attributes }
  }

  /** The instrumentation scope. */
  private scope(): Record<string, unknown> {
    return { name: 'dsh-observe', version: VERSION }
  }
}

/** Parse a metric aggregation key back into name + attributes. */

/** Metric units. */
function unitOf(name: string): string {
  if (name === 'observe.cost') return 'USD'
  if (name === 'observe.export_failures' || name === 'observe.spool_flushed') return 'requests'
  return 'records'
}

/** One Langfuse ingestion event. */
interface LangfuseEvent {
  id: string
  timestamp: string
  type: string
  body: Record<string, unknown>
}

/**
 * The Langfuse backend. Each export batch is one ingestion POST; the trace
 * each observation belongs to is created (once per trace id, remembered
 * after a successful POST) inside the same batch, so a batch is always
 * self-contained and retries stay idempotent — Langfuse upserts on event
 * ids.
 */
export class LangfuseSink implements SpanSink {
  readonly name = 'langfuse' as const

  private readonly seenTraces = new Set<string>()

  /**
   * @param config - the resolved Langfuse backend config.
   * @param logger - the plugin logger.
   */
  constructor(
    private readonly config: ResolvedLangfuse,
    private readonly logger: ObserveLogger,
  ) {}

  async exportSpans(records: readonly ExportRecord[]): Promise<void> {
    const spans = records.flatMap(record => record.kind === 'span' ? [record.span] : [])
    if (spans.length === 0) return
    const events: LangfuseEvent[] = []
    const ensured: string[] = []
    // One batch may carry several spans of the same trace: remember the
    // in-batch creations too, so a single trace-create event rides each POST.
    const ensuredInBatch = new Set<string>()
    for (const span of spans) {
      const traceId = langfuseTraceId(span.sessionId, span.turn)
      if (!this.seenTraces.has(traceId) && !ensuredInBatch.has(traceId)) {
        ensuredInBatch.add(traceId)
        ensured.push(traceId)
        events.push(this.traceEvent(traceId, span))
      }
      events.push(this.observationEvent(traceId, span))
    }
    try {
      await this.post({ batch: events })
      for (const traceId of ensured) this.seenTraces.add(traceId)
    } catch (error) {
      this.logger.warn(`langfuse: export failed: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  /** The `trace-create` event for one turn span. */
  private traceEvent(traceId: string, span: SpanRecord): LangfuseEvent {
    const metadata: Record<string, unknown> = { ...span.attributes }
    if (span.kind === 'turn') metadata['observe.span.kind'] = 'turn'
    return {
      id: langfuseId('trace-event', traceId),
      timestamp: isoTimestamp(span.startUnixNano),
      type: 'trace-create',
      body: {
        id: traceId,
        name: this.config.traceName
          .replaceAll('{session}', span.sessionId)
          .replaceAll('{turn}', String(span.turn)),
        sessionId: span.sessionId,
        timestamp: isoTimestamp(span.startUnixNano),
        metadata,
        ...(this.config.release === undefined ? {} : { release: this.config.release }),
        ...(this.config.tags.length === 0 ? {} : { tags: [...this.config.tags] }),
      },
    }
  }

  /** The observation event for one span (span-create or generation-create). */
  private observationEvent(traceId: string, span: SpanRecord): LangfuseEvent {
    if (span.llm !== undefined) return this.generationEvent(traceId, span)
    const id = span.kind === 'step'
      ? langfuseId('step', span.sessionId, span.turn, span.step ?? -1)
      : langfuseId('tool', span.sessionId, span.turn, span.step ?? -1, span.callId ?? span.tool?.name ?? 'tool')
    return {
      id: langfuseId('span-event', id),
      timestamp: isoTimestamp(span.startUnixNano),
      type: 'span-create',
      body: {
        id,
        traceId,
        name: spanName(span),
        startTime: isoTimestamp(span.startUnixNano),
        endTime: isoTimestamp(span.endUnixNano),
        metadata: { ...span.attributes, ...(span.tool === undefined ? {} : { 'tool.status': span.tool.status }) },
        ...(span.tool?.input === undefined ? {} : { input: span.tool.input }),
        ...(span.tool?.output === undefined ? {} : { output: span.tool.output }),
        level: span.status === 'error' ? 'ERROR' : 'DEFAULT',
      },
    }
  }

  /** The `generation-create` event for one LLM span. */
  private generationEvent(traceId: string, span: SpanRecord): LangfuseEvent {
    const id = langfuseId('generation', span.sessionId, span.turn, span.step ?? -1)
    const usage = span.llm?.usage
    return {
      id: langfuseId('generation-event', id),
      timestamp: isoTimestamp(span.startUnixNano),
      type: 'generation-create',
      body: {
        id,
        traceId,
        name: 'llm.request',
        startTime: isoTimestamp(span.startUnixNano),
        endTime: isoTimestamp(span.endUnixNano),
        ...(span.llm?.model === undefined ? {} : { model: span.llm.model }),
        metadata: { ...span.attributes, ...(span.llm?.costUsd === undefined ? {} : { costUsd: span.llm.costUsd }) },
        ...(span.llm?.input === undefined ? {} : { input: span.llm.input }),
        ...(span.llm?.output === undefined ? {} : { output: span.llm.output }),
        ...(usage === undefined ? {} : {
          usage: { input: usage.input + usage.cacheRead + usage.cacheWrite, output: usage.output, total: usage.input + usage.cacheRead + usage.cacheWrite + usage.output, unit: 'TOKENS' },
        }),
        level: span.status === 'error' ? 'ERROR' : 'DEFAULT',
      },
    }
  }

  /** POST one ingestion batch with Basic auth. */
  private async post(body: unknown): Promise<void> {
    const authorization = Buffer.from(`${this.config.publicKey}:${this.config.secretKey}`, 'utf8').toString('base64')
    const response = await fetch(`${this.config.baseUrl}/api/public/ingestion`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Basic ${authorization}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    })
    if (!response.ok) {
      throw new Error(`langfuse ingestion responded ${response.status} ${response.statusText}`)
    }
    // 2xx with per-event errors still means some records failed: treat it as
    // a retryable failure (Langfuse upserts by id, so retries are safe).
    const result = await response.json() as { errors?: unknown[] }
    if (Array.isArray(result.errors) && result.errors.length > 0) {
      throw new Error(`langfuse ingestion reported ${result.errors.length} event error(s)`)
    }
  }
}
