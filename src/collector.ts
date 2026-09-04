/**
 * The session/event collector: turns the durable session log stream into
 * closed span records and metric samples. Spans open at their boundary
 * events and close at their counterpart events (turn/start → turn/end,
 * step/start → step/end, tool/call → tool/result, request/header →
 * assistant/message); a missing closer (crash, disposal) closes the span
 * with an error status at the latest observed event time. Everything
 * exported is reconstructable from the session log alone — the collector
 * invents no model-visible content, and prompt/completion bodies come from
 * the logged header and the session surface.
 * @module dsh-observe/collector
 */

import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import type { StreamChunk } from '@deepseek-ai/dsh-llm/types'
import type { EpochHeader, RequestContext, Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { deriveEventMessage } from '@deepseek-ai/dsh-session'
import type { ResolvedConfig } from './config.ts'
import type { JsonScalar, MetricRecord, SpanRecord, TokenCounts } from './model.ts'
import { findPrice, costUsd } from './pricing.ts'
import { projectContent, projectMessage } from './project.ts'
import { sanitizeJsonText, sanitizeText } from './sanitize.ts'
import type { ObserveLogger } from './sinks.ts'

/** Milliseconds → Unix nanoseconds. */
const NANO = 1_000_000

/**
 * The structural surface of the optional `ctx.tokenMeter` service. Only the
 * fields dsh-observe reads are declared; the service is optional, so a host
 * without it simply skips the context-token gauge.
 */
export interface TokenMeterService {
  measure(session: Session): {
    totalTokens: number
    baseline?: { kind?: string }
  }
}

/** One open tool call awaiting its result. */
interface ToolSpanState {
  turn: number
  step: number
  name: string
  arguments: string
  startUnixNano: number
  attempt: number
}

/** One open step. */
interface StepState {
  turn: number
  step: number
  startUnixNano: number
  /** Time of the step's first `request/header` — the LLM span start. */
  requestStartUnixNano: number | undefined
  /** First token-producing stream chunk time. */
  firstChunkUnixNano: number | undefined
  finishReason: string | undefined
  llmClosed: boolean
  /** Sanitized prompt snapshot, captured at `request/header` when enabled. */
  prompt: string | undefined
  /** Occurrence counts of exact (name, arguments) pairs — retry derivation. */
  toolCounts: Map<string, number>
}

/** All live tracking state for one session. */
interface SessionState {
  turn: { turn: number; startUnixNano: number } | undefined
  step: StepState | undefined
  tools: Map<string, ToolSpanState>
  header: EpochHeader | undefined
  context: RequestContext | undefined
  lastEventUnixNano: number
}

/** Normalize provider usage to the export-facing token counts. */
function normalizeUsage(usage: TokenUsage | undefined): TokenCounts | undefined {
  if (usage === undefined) return undefined
  return {
    input: usage.inputTokens,
    output: usage.outputTokens,
    cacheRead: usage.cacheReadTokens ?? 0,
    cacheWrite: usage.cacheWriteTokens ?? 0,
    reasoning: usage.reasoningTokens ?? 0,
  }
}

/**
 * Whether a stream chunk carries visible model output (the first-token
 * boundary). Local replication of the rc.2 `@deepseek-ai/dsh-llm/message`
 * `isTokenDelta` helper, which host 0.1.2-alpha.1 removed from that module:
 * the host's whole-log sessionStats projection now inlines the same switch
 * (`packages/session/session-stats/src/projection.ts`), and the chunk
 * grammar itself is unchanged, so this predicate stays identical on both
 * rulers. Empty deltas (heartbeats, empty tool-call frames) do not count as
 * a first token.
 * @param chunk - the stream chunk to test.
 * @returns true when the chunk contains a non-empty text/reasoning/tool delta.
 */
function isTokenDelta(chunk: StreamChunk): boolean {
  switch (chunk.type) {
    case 'text-delta':
    case 'reasoning-delta':
      return chunk.text !== ''
    case 'tool-call-delta':
      return chunk.argumentsDelta !== '' || chunk.name !== undefined
    default:
      return false
  }
}

/**
 * Local minimal structural type for one record of the v2
 * `assistant/message` embedded stream (`AssistantStreamRecord` on host
 * 0.1.3-alpha.1, which is not published to npm). The pinned 0.1.2-rc.1
 * types have no `stream` field, so the read is structural only.
 */
interface EmbeddedStreamRecord {
  readonly type: 'text-chunks' | 'reasoning-chunks' | 'tool-call-chunks' | 'chunk'
  readonly time0?: number
  readonly dt?: readonly number[]
  readonly texts?: readonly string[]
  readonly args?: readonly string[]
  readonly time?: number
  readonly chunk?: StreamChunk
}

/**
 * Recover finish reason and first-token timing from the v2 embedded stream
 * when an `assistant/message` event carries one. On the pinned rc.1 line the
 * field is absent and the legacy `assistant/chunk` branch keeps doing the
 * work; on 0.1.3-alpha.1 `assistant/chunk` no longer exists, so this path is
 * the only source for those two span fields. Compact runs carry member i at
 * `time0 + sum(dt[0..i-1])`; every member is a token-delta boundary, so the
 * run's first non-empty member is the first token.
 * @param state - the open step state to fill.
 * @param data - the `assistant/message` event data.
 */
function consumeEmbeddedStream(state: SessionState, data: unknown): void {
  const stream = (data as { stream?: unknown } | undefined)?.stream
  if (!Array.isArray(stream)) return
  const step = state.step
  if (step === undefined) return
  const records = stream as unknown as EmbeddedStreamRecord[]
  for (const record of records) {
    if (record === null || typeof record !== 'object') continue
    if (record.type === 'chunk') {
      if (record.time === undefined || record.chunk === undefined) continue
      if (record.chunk.type === 'finish') {
        step.finishReason = record.chunk.reason.kind
      } else if (step.firstChunkUnixNano === undefined && isTokenDelta(record.chunk)) {
        step.firstChunkUnixNano = record.time * NANO
      }
      continue
    }
    const members = record.type === 'tool-call-chunks' ? record.args : record.texts
    if (members === undefined || members.length === 0 || record.time0 === undefined) continue
    let time = record.time0
    for (let index = 0; index < members.length; index += 1) {
      if (index > 0) time += record.dt?.[index - 1] ?? 0
      if (members[index] === '') continue
      if (step.firstChunkUnixNano === undefined) step.firstChunkUnixNano = time * NANO
      break
    }
  }
}

/**
 * The event → span/metric collector. State lives in a WeakMap keyed by the
 * live Session, so sessions the plugin stops seeing are garbage-collected.
 */
export class Collector {
  private readonly states = new WeakMap<Session, SessionState>()

  /**
   * @param config - the resolved plugin config.
   * @param tokenMeter - lazy lookup of the optional token meter service.
   * @param onSpan - span sink (both pipelines).
   * @param onMetric - metric sink (OTLP aggregation).
   * @param logger - the plugin logger.
   */
  constructor(
    private readonly config: ResolvedConfig,
    private readonly tokenMeter: () => TokenMeterService | undefined,
    private readonly onSpan: (span: SpanRecord) => void,
    private readonly onMetric: (metric: MetricRecord) => void,
    private readonly logger: ObserveLogger,
  ) {}

  /**
   * Fold one appended session event.
   * @param session - the session the event belongs to.
   * @param event - the appended event.
   */
  handleEvent(session: Session, event: SessionEvent): void {
    const state = this.stateOf(session)
    state.lastEventUnixNano = event.time * NANO
    switch (event.type) {
      case 'turn/start':
        this.turnStart(session, state, event)
        break
      case 'step/start':
        this.stepStart(session, state, event)
        break
      case 'request/header':
        state.header = event.data.header
        if (this.config.capture.llm
          && this.config.llm.prompt
          && state.step !== undefined
          && state.step.requestStartUnixNano === undefined) {
          state.step.requestStartUnixNano = event.time * NANO
          state.step.prompt = this.capturePrompt(session, event.data.header)
        }
        break
      case 'request/context':
        state.context = event.data
        break
      case 'assistant/chunk':
        if (state.step !== undefined) {
          if (event.data.chunk.type === 'finish') {
            state.step.finishReason = event.data.chunk.reason.kind
          } else if (state.step.firstChunkUnixNano === undefined && isTokenDelta(event.data.chunk)) {
            state.step.firstChunkUnixNano = event.time * NANO
          }
        }
        break
      case 'assistant/message':
        consumeEmbeddedStream(state, event.data)
        this.assistantMessage(session, state, event)
        break
      case 'tool/call':
        this.toolCall(session, state, event)
        break
      case 'tool/result':
        this.toolResult(session, state, event)
        break
      case 'step/end':
        this.stepEnd(session, state, event)
        break
      case 'turn/end':
        this.turnEnd(session, state, event)
        break
      default:
        // Unknown or plugin-owned session events: nothing to export.
        break
    }
  }

  /**
   * Close every open span for a session leaving the store.
   * @param session - the disposed session.
   */
  handleSessionDisposed(session: Session): void {
    const state = this.states.get(session)
    if (state === undefined) return
    const end = state.lastEventUnixNano
    if (state.step !== undefined) this.closeStep(session, state, state.step, end, true)
    if (state.turn !== undefined && this.config.capture.turns) {
      const attributes = this.baseAttributes(session, state.turn.turn)
      attributes['turn.reason'] = 'disposed'
      this.onSpan({
        kind: 'turn',
        sessionId: session.id,
        turn: state.turn.turn,
        startUnixNano: state.turn.startUnixNano,
        endUnixNano: end,
        attributes,
        status: 'error',
      })
    }
    this.states.delete(session)
  }

  private stateOf(session: Session): SessionState {
    const existing = this.states.get(session)
    if (existing !== undefined) return existing
    const state: SessionState = {
      turn: undefined,
      step: undefined,
      tools: new Map(),
      header: undefined,
      context: undefined,
      lastEventUnixNano: Date.now() * NANO,
    }
    this.states.set(session, state)
    return state
  }

  private turnStart(session: Session, state: SessionState, event: SessionEvent<'turn/start'>): void {
    if (state.step !== undefined) this.closeStep(session, state, state.step, event.time * NANO, true)
    if (state.turn !== undefined && this.config.capture.turns) {
      // The previous turn never closed: close it now so its span cannot leak.
      const attributes = this.baseAttributes(session, state.turn.turn)
      attributes['turn.reason'] = 'aborted'
      this.onSpan({
        kind: 'turn',
        sessionId: session.id,
        turn: state.turn.turn,
        startUnixNano: state.turn.startUnixNano,
        endUnixNano: event.time * NANO,
        attributes,
        status: 'error',
      })
    }
    state.turn = { turn: event.data.turn, startUnixNano: event.time * NANO }
  }

  private stepStart(session: Session, state: SessionState, event: SessionEvent<'step/start'>): void {
    if (state.step !== undefined) this.closeStep(session, state, state.step, event.time * NANO, true)
    state.step = {
      turn: event.data.turn,
      step: event.data.step,
      startUnixNano: event.time * NANO,
      requestStartUnixNano: undefined,
      firstChunkUnixNano: undefined,
      finishReason: undefined,
      llmClosed: false,
      prompt: undefined,
      toolCounts: new Map(),
    }
  }

  private assistantMessage(session: Session, state: SessionState, event: SessionEvent<'assistant/message'>): void {
    const step = state.step
    if (step === undefined || step.turn !== event.data.turn || step.step !== event.data.step) {
      this.logger.warn(`session "${session.id}": assistant/message at seq ${event.seq} has no matching open step; llm span skipped`)
      return
    }
    if (this.config.capture.llm) {
      const start = step.requestStartUnixNano ?? step.startUnixNano
      const end = event.time * NANO
      const { provider, model } = this.modelOf(state)
      const usage = normalizeUsage(event.data.usage)
      const price = usage !== undefined && provider !== undefined && model !== undefined
        ? findPrice(this.config.pricing, provider, model)
        : undefined
      const cost = usage !== undefined && price !== undefined ? costUsd(price, usage) : undefined
      const output = this.config.llm.completion
        ? sanitizeText(
          projectContent(event.data.message.content),
          this.config.sanitize.truncateCompletionChars,
          this.config.sanitize,
        )
        : undefined
      this.onSpan({
        kind: 'llm',
        sessionId: session.id,
        turn: step.turn,
        step: step.step,
        startUnixNano: start,
        endUnixNano: end,
        attributes: this.baseAttributes(session, step.turn, step.step),
        status: 'ok',
        llm: {
          ...(this.config.metadata.model && model !== undefined ? { model } : {}),
          ...(this.config.metadata.model && provider !== undefined ? { provider } : {}),
          ...(usage === undefined ? {} : { usage }),
          ...(step.finishReason === undefined ? {} : { finishReason: step.finishReason }),
          ...(step.firstChunkUnixNano === undefined
            ? {}
            : { ttftMs: Math.max(0, Math.round((step.firstChunkUnixNano - start) / NANO)) }),
          ...(step.prompt === undefined ? {} : { input: step.prompt }),
          ...(output === undefined ? {} : { output }),
          ...(cost === undefined ? {} : { costUsd: cost }),
        },
      })
      step.llmClosed = true
      if (usage !== undefined) this.emitUsageMetrics(provider, model, usage, cost)
    }
  }

  private toolCall(_session: Session, state: SessionState, event: SessionEvent<'tool/call'>): void {
    const step = state.step
    if (step === undefined || step.turn !== event.data.turn || step.step !== event.data.step) return
    if (!this.config.capture.tools) return
    const key = `${event.data.name}\u0000${event.data.arguments}`
    const attempt = (step.toolCounts.get(key) ?? 0) + 1
    step.toolCounts.set(key, attempt)
    state.tools.set(event.data.callId, {
      turn: step.turn,
      step: step.step,
      name: event.data.name,
      arguments: event.data.arguments,
      startUnixNano: event.time * NANO,
      attempt,
    })
  }

  private toolResult(session: Session, state: SessionState, event: SessionEvent<'tool/result'>): void {
    const callId = event.data.message.source.callId
    const open = state.tools.get(callId)
    if (open === undefined) return
    state.tools.delete(callId)
    const status = event.data.error === undefined ? 'ok' : 'error'
    const attributes = this.baseAttributes(session, open.turn, open.step)
    attributes['tool.status'] = status
    attributes['tool.attempt'] = open.attempt
    attributes['tool.retries'] = open.attempt - 1
    if (event.data.error !== undefined) {
      attributes['tool.error.name'] = this.attr(event.data.error.name)
      attributes['tool.error.code'] = this.attr(event.data.error.code)
    }
    const input = sanitizeJsonText(open.arguments, this.config.sanitize.truncateToolInputChars, this.config.sanitize)
    const output = sanitizeText(
      projectContent(event.data.message.content),
      this.config.sanitize.truncateToolOutputChars,
      this.config.sanitize,
    )
    this.onSpan({
      kind: 'tool',
      sessionId: session.id,
      turn: open.turn,
      step: open.step,
      callId,
      startUnixNano: open.startUnixNano,
      endUnixNano: event.time * NANO,
      attributes,
      status,
      tool: {
        name: open.name,
        status,
        ...(event.data.error === undefined ? {} : {
          errorName: this.attr(event.data.error.name),
          errorCode: this.attr(event.data.error.code),
        }),
        input,
        output,
        attempt: open.attempt,
        retries: open.attempt - 1,
      },
    })
  }

  private stepEnd(session: Session, state: SessionState, event: SessionEvent<'step/end'>): void {
    const step = state.step
    if (step === undefined || step.turn !== event.data.turn || step.step !== event.data.step) return
    this.closeStep(session, state, step, event.time * NANO, false)
  }

  private turnEnd(session: Session, state: SessionState, event: SessionEvent<'turn/end'>): void {
    const turn = state.turn
    if (turn === undefined || turn.turn !== event.data.turn) return
    const end = event.time * NANO
    if (state.step !== undefined && state.step.turn === turn.turn) {
      this.closeStep(session, state, state.step, end, true)
    }
    if (this.config.capture.turns) {
      const attributes = this.baseAttributes(session, turn.turn)
      attributes['turn.reason'] = event.data.reason.kind
      if (event.data.reason.kind === 'error') {
        attributes['turn.error.code'] = this.attr(event.data.reason.error.code)
        attributes['turn.error.message'] = this.attr(event.data.reason.error.message)
      } else if (event.data.reason.kind === 'aborted') {
        attributes['turn.cancel.kind'] = event.data.reason.reason.kind
      }
      this.onSpan({
        kind: 'turn',
        sessionId: session.id,
        turn: turn.turn,
        startUnixNano: turn.startUnixNano,
        endUnixNano: end,
        attributes,
        status: event.data.reason.kind === 'error' ? 'error' : 'ok',
      })
    }
    state.turn = undefined
  }

  /** Close one step: dangling LLM span, dangling tool spans, the step span, and the context gauge. */
  private closeStep(session: Session, state: SessionState, step: StepState, endUnixNano: number, forced: boolean): void {
    if (this.config.capture.llm && !step.llmClosed && step.requestStartUnixNano !== undefined) {
      const attributes = this.baseAttributes(session, step.turn, step.step)
      attributes['observe.incomplete'] = true
      this.onSpan({
        kind: 'llm',
        sessionId: session.id,
        turn: step.turn,
        step: step.step,
        startUnixNano: step.requestStartUnixNano,
        endUnixNano,
        attributes,
        status: 'error',
        llm: {
          ...(step.finishReason === undefined ? {} : { finishReason: step.finishReason }),
        },
      })
      step.llmClosed = true
    }
    for (const [callId, open] of [...state.tools]) {
      if (open.turn !== step.turn || open.step !== step.step) continue
      state.tools.delete(callId)
      const attributes = this.baseAttributes(session, open.turn, open.step)
      attributes['tool.status'] = 'error'
      attributes['tool.attempt'] = open.attempt
      attributes['tool.retries'] = open.attempt - 1
      attributes['tool.error.code'] = 'ABORTED'
      attributes['observe.incomplete'] = true
      this.onSpan({
        kind: 'tool',
        sessionId: session.id,
        turn: open.turn,
        step: open.step,
        callId,
        startUnixNano: open.startUnixNano,
        endUnixNano,
        attributes,
        status: 'error',
        tool: {
          name: open.name,
          status: 'error',
          errorCode: 'ABORTED',
          attempt: open.attempt,
          retries: open.attempt - 1,
        },
      })
    }
    if (this.config.capture.steps) {
      const attributes = this.baseAttributes(session, step.turn, step.step)
      if (forced) attributes['observe.aborted'] = true
      const { provider, model } = this.modelOf(state)
      if (this.config.metadata.model) {
        if (provider !== undefined) attributes.provider = provider
        if (model !== undefined) attributes.model = model
      }
      this.onSpan({
        kind: 'step',
        sessionId: session.id,
        turn: step.turn,
        step: step.step,
        startUnixNano: step.startUnixNano,
        endUnixNano,
        attributes,
        status: 'ok',
      })
    }
    this.emitContextGauge(session, state)
    state.step = undefined
  }

  /** The context-pressure gauge from the optional token meter (contained). */
  private emitContextGauge(session: Session, state: SessionState): void {
    if (!this.config.metrics.contextTokens) return
    const meter = this.tokenMeter()
    if (meter === undefined) return
    try {
      const measurement = meter.measure(session)
      const attributes: Record<string, string> = {}
      const { provider, model } = this.modelOf(state)
      if (provider !== undefined) attributes.provider = provider
      if (model !== undefined) attributes.model = model
      attributes.baseline = measurement.baseline?.kind ?? 'unknown'
      this.onMetric({
        name: 'observe.context_tokens',
        kind: 'gauge',
        unit: 'tokens',
        value: measurement.totalTokens,
        attributes,
      })
    } catch (error) {
      this.logger.warn(`session "${session.id}": token meter measurement failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** Token and cost counters for one LLM call. */
  private emitUsageMetrics(
    provider: string | undefined,
    model: string | undefined,
    usage: TokenCounts,
    cost: number | undefined,
  ): void {
    if (this.config.metrics.tokens && provider !== undefined && model !== undefined) {
      const kinds: [string, number][] = [
        ['input', usage.input],
        ['output', usage.output],
        ['cache_read', usage.cacheRead],
        ['cache_write', usage.cacheWrite],
        ['reasoning', usage.reasoning],
      ]
      for (const [kind, value] of kinds) {
        if (value > 0) {
          this.onMetric({
            name: 'observe.tokens',
            kind: 'counter',
            unit: 'tokens',
            value,
            attributes: { provider, model, kind },
          })
        }
      }
    }
    if (this.config.metrics.cost && cost !== undefined && provider !== undefined && model !== undefined) {
      this.onMetric({
        name: 'observe.cost',
        kind: 'counter',
        unit: 'USD',
        value: cost,
        attributes: { provider, model },
      })
    }
  }

  /** The sanitized prompt snapshot: logged system prompt plus the current session surface. */
  private capturePrompt(session: Session, header: EpochHeader | undefined): string {
    const parts: string[] = []
    if (header?.system !== undefined) parts.push(header.system)
    // alpha.5 renamed the Session.events getter to snapshotEvents(); older hosts
    // (the >=0.1.0-rc.8 peer floor) still expose .events, so detect at runtime.
    const events = typeof session.snapshotEvents === 'function'
      ? session.snapshotEvents()
      : (session as unknown as { events: readonly SessionEvent[] }).events
    for (const seq of session.surface.nodes) {
      const event = events[seq]
      if (event === undefined) continue
      const message = deriveEventMessage(event)
      if (message !== null) parts.push(projectMessage(message))
    }
    return sanitizeText(parts.join('\n'), this.config.sanitize.truncatePromptChars, this.config.sanitize)
  }

  /** The current provider/model attribution: request context first, then the logged header. */
  private modelOf(state: SessionState): { provider: string | undefined; model: string | undefined } {
    return {
      provider: state.context?.provider ?? state.header?.config.provider,
      model: state.context?.model ?? state.header?.config.model,
    }
  }

  /** Common span attributes (sanitized and budgeted). */
  private baseAttributes(session: Session, turn: number, step?: number): Record<string, JsonScalar> {
    const attributes: Record<string, JsonScalar> = { turn }
    if (step !== undefined) attributes.step = step
    if (this.config.metadata.sessionId) attributes['session.id'] = session.id
    if (this.config.metadata.cwd && session.header.cwd !== undefined) {
      attributes['session.cwd'] = this.attr(session.header.cwd)
    }
    if (this.config.metadata.agentPreset && session.header.agentPreset !== undefined) {
      attributes['agent.preset'] = this.attr(session.header.agentPreset)
    }
    return attributes
  }

  /** Sanitize and bound one attribute string. */
  private attr(value: string): string {
    return sanitizeText(value, this.config.sanitize.truncateAttributeChars, this.config.sanitize)
  }
}
