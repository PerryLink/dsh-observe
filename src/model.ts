/**
 * Owned JSON record model shared by both export backends. Everything here
 * is plain data, already sanitized, and fully detached from live harness
 * objects — records are the only thing that ever crosses the plugin's
 * process boundary, so no Cordis/Session reference can leak into a payload.
 * @module dsh-observe/model
 */

/** JSON-scalar attribute values. */
export type JsonScalar = string | number | boolean

/** Normalized token accounting for one LLM call. */
export interface TokenCounts {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  reasoning: number
}

/** Tool-specific span payload (sanitized at capture). */
export interface ToolSpanInfo {
  name: string
  status: 'ok' | 'error'
  errorName?: string
  errorCode?: string
  input?: string
  output?: string
  /** 1-based occurrence of this exact (name, arguments) pair within the step. */
  attempt: number
  /** `attempt - 1` — earlier identical calls in the same step are retries. */
  retries: number
}

/** LLM-specific span payload (sanitized at capture). */
export interface LlmSpanInfo {
  model?: string
  provider?: string
  usage?: TokenCounts
  finishReason?: string
  ttftMs?: number
  input?: string
  output?: string
  costUsd?: number
}

/** The span families. */
export type SpanKind = 'turn' | 'step' | 'tool' | 'llm'

/** One closed span, ready for export. */
export interface SpanRecord {
  kind: SpanKind
  sessionId: string
  turn: number
  /** Present for step/tool/llm spans; absent for turn spans. */
  step?: number
  /** The tool call id (tool spans only) — anchors the deterministic span id. */
  callId?: string
  startUnixNano: number
  endUnixNano: number
  attributes: Record<string, JsonScalar>
  status: 'ok' | 'error'
  tool?: ToolSpanInfo
  llm?: LlmSpanInfo
}

/**
 * One metric sample. Counters carry deltas (the OTLP sink aggregates them
 * into cumulative sums); gauges carry absolute values (last write wins).
 */
export interface MetricRecord {
  name: string
  kind: 'counter' | 'gauge'
  unit: string
  value: number
  attributes: Record<string, string>
}

/** The record union that flows through pipelines, spool, and sinks. */
export type ExportRecord =
  | { kind: 'span'; span: SpanRecord }
  | { kind: 'metric'; metric: MetricRecord }

/**
 * Validate a value read back from the durable spool: it must look like an
 * export record. The spool is a durable boundary, so hostile or hand-edited
 * values are rejected here instead of reaching a sink.
 * @param value - the stored value.
 * @returns true when the value is an {@link ExportRecord}.
 */
export function isExportRecord(value: unknown): value is ExportRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as { kind?: unknown; span?: unknown; metric?: unknown }
  if (record.kind === 'span') return typeof record.span === 'object' && record.span !== null
  if (record.kind === 'metric') return typeof record.metric === 'object' && record.metric !== null
  return false
}

/** The two export backends. */
export type BackendName = 'otlp' | 'langfuse'
