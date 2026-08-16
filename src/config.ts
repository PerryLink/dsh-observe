/**
 * Config schema and resolution for `dsh-observe`. Every tunable is a
 * validated {@link Config} field changeable from cordis.yml; the resolution
 * step validates numeric bounds, endpoint shapes, and backend credential
 * presence so misconfiguration fails loud at mount — never silently skips
 * or half-enables a backend. The plugin is off unless `enabled: true` AND at
 * least one backend is configured: exporting observability data requires
 * explicit opt-in (privacy default: off).
 * @module dsh-observe/config
 */

import z from '@deepseek-ai/schemastery'

/** Whether capture of one span family is enabled. */
export interface CaptureConfig {
  /** Turn lifecycle spans (start/end/reason). */
  turns?: boolean
  /** Step lifecycle spans, parented under their turn. */
  steps?: boolean
  /** Tool-call spans with duration, status, and sanitized arguments/results. */
  tools?: boolean
  /** LLM generation spans with sanitized prompt/completion and usage. */
  llm?: boolean
}

/** Whether and how LLM prompt/completion bodies are captured. */
export interface LlmCaptureConfig {
  /**
   * Capture the sanitized request prompt (system prompt plus the session
   * surface as of the request). `false` records only sizes and counts.
   */
  prompt?: boolean
  /** Capture the sanitized assistant completion. `false` records only sizes. */
  completion?: boolean
}

/** Metadata capture switches; every one defaults to off except session identity. */
export interface MetadataCaptureConfig {
  /** Session id (always exported as the trace identity; disabling it removes it from attribute values). */
  sessionId?: boolean
  /** Session working directory. Local path — off by default. */
  cwd?: boolean
  /** Agent preset id the session was composed from, when known. */
  agentPreset?: boolean
  /** Model and provider ids on step/llm/tool attributes. */
  model?: boolean
}

/** Whether each metric family is exported. */
export interface MetricsCaptureConfig {
  /** Token counters per provider/model from `assistant/message` usage. */
  tokens?: boolean
  /** Cost counter per provider/model when a {@link PricingRule} matches. */
  cost?: boolean
  /** Context-pressure gauge from `ctx.tokenMeter` at step end (needs the service). */
  contextTokens?: boolean
}

/**
 * One pricing rule. A metric is priced by the FIRST rule in list order whose
 * `model` (glob over the model id, e.g. `deepseek-chat`, `*`) and optional
 * `provider` (exact route id) match the usage's attribution. Prices are USD
 * per token. Cache fields are optional: an absent cache price charges cache
 * traffic at the corresponding input price.
 */
export interface PricingRule {
  /** Exact provider route id, or omitted to match every provider. */
  provider?: string
  /** Glob pattern over the model id; `*` matches any model. */
  model: string
  /** USD per uncached input token. */
  inputPerToken: number
  /** USD per output token. */
  outputPerToken: number
  /** USD per cache-read token; defaults to `inputPerToken` when absent. */
  cacheReadPerToken?: number
  /** USD per cache-write token; defaults to `inputPerToken` when absent. */
  cacheWritePerToken?: number
}

/** The shared sanitization policy applied before any record is queued or spooled. */
export interface SanitizeConfig {
  /** Master switch; when `false` only truncation applies (no redaction). */
  enabled?: boolean
  /**
   * Key-name substrings (case-insensitive) whose values are replaced with
   * `[REDACTED]` wherever they appear: `key`, `token`, `secret`, `password`,
   * `authorization`, `credential`, `apiKey` are always included.
   */
  redactKeys?: string[]
  /**
   * Additional regular expressions applied to string values; every match is
   * replaced with `[REDACTED]`. Compiled once at mount; an invalid pattern
   * fails the mount loudly. Beware of unbounded patterns (ReDoS): they run
   * over every captured string.
   */
  redactPatterns?: string[]
  /** Prompt character budget (system prompt + surface projection). */
  truncatePromptChars?: number
  /** Completion character budget. */
  truncateCompletionChars?: number
  /** Tool argument character budget. */
  truncateToolInputChars?: number
  /** Tool result character budget. */
  truncateToolOutputChars?: number
  /** Cap on any single span attribute string value. */
  truncateAttributeChars?: number
}

/** The shared batching policy for both backends. */
export interface BatchConfig {
  /** Flush once the in-memory queue holds this many records. */
  maxRecords?: number
  /** Flush interval in milliseconds when the queue stays below `maxRecords`. */
  flushIntervalMs?: number
  /** Bound on the in-memory queue; excess spills to the offline buffer. */
  maxQueueRecords?: number
  /** Bound on the offline buffer in records; beyond it the oldest record is dropped. */
  maxBufferRecords?: number
  /** How often the offline buffer is retried, in milliseconds. */
  bufferRetryIntervalMs?: number
}

/** The shared retry policy for network exports. */
export interface RetryConfig {
  /** Attempts per batch, including the first try. */
  maxAttempts?: number
  /** First backoff delay in milliseconds. */
  baseDelayMs?: number
  /** Backoff multiplier per consecutive failure. */
  factor?: number
  /** Upper bound on the computed delay in milliseconds. */
  maxDelayMs?: number
}

/** OpenTelemetry OTLP/HTTP backend (traces + metrics, JSON encoding). */
export interface OtlpConfig {
  /** Base OTLP/HTTP endpoint, e.g. `http://localhost:4318`; `/v1/traces` and `/v1/metrics` are appended. */
  endpoint: string
  /** `service.name` resource attribute; defaults to `deepseek-harness`. */
  serviceName?: string
  /** `service.version` resource attribute, when set. */
  serviceVersion?: string
  /** Extra headers merged into every export request. */
  headers?: Record<string, string>
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number
}

/** Langfuse backend (LLM observability ingestion). */
export interface LangfuseConfig {
  /** Langfuse base URL; defaults to the Langfuse Cloud endpoint. */
  baseUrl?: string
  /** Project public key. */
  publicKey: string
  /** Project secret key. */
  secretKey: string
  /** Release tag stamped onto traces. */
  release?: string
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number
}

/** Optional Typert remote service exposing the runtime kill switch to settings pages. */
export interface RemoteConfig {
  /** Mount the `observe` Typert remote (`observe/status`, `observe/setEnabled`). */
  enabled?: boolean
}

/** Raw plugin config — every field optional; {@link resolveConfig} supplies the defaults. */
export interface Config {
  /** Master switch. Off by default: nothing is exported unless explicitly enabled. */
  enabled?: boolean
  /** OTLP backend; `null`/omitted disables it. */
  otlp?: OtlpConfig | null
  /** Langfuse backend; `null`/omitted disables it. */
  langfuse?: LangfuseConfig | null
  /** Span families to capture. */
  capture?: CaptureConfig
  /** LLM prompt/completion capture policy. */
  llm?: LlmCaptureConfig
  /** Metadata capture switches. */
  metadata?: MetadataCaptureConfig
  /** Metric families to export. */
  metrics?: MetricsCaptureConfig
  /** Pricing table for the cost metric; empty by default (no prices are hardcoded). */
  pricing?: PricingRule[]
  /** Pre-send sanitization policy. */
  sanitize?: SanitizeConfig
  /** Batching policy (shared by both backends). */
  batch?: BatchConfig
  /** Retry/backoff policy (shared by both backends). */
  retry?: RetryConfig
  /** Optional Typert remote surface. */
  remote?: RemoteConfig
}

/** Fully resolved capture policy. */
export interface ResolvedCapture {
  readonly turns: boolean
  readonly steps: boolean
  readonly tools: boolean
  readonly llm: boolean
}

/** Fully resolved LLM capture policy. */
export interface ResolvedLlmCapture {
  readonly prompt: boolean
  readonly completion: boolean
}

/** Fully resolved metadata policy. */
export interface ResolvedMetadata {
  readonly sessionId: boolean
  readonly cwd: boolean
  readonly agentPreset: boolean
  readonly model: boolean
}

/** Fully resolved metric policy. */
export interface ResolvedMetrics {
  readonly tokens: boolean
  readonly cost: boolean
  readonly contextTokens: boolean
}

/** Fully resolved sanitization policy. */
export interface ResolvedSanitize {
  readonly enabled: boolean
  readonly redactKeys: readonly string[]
  readonly redactPatterns: readonly RegExp[]
  readonly truncatePromptChars: number
  readonly truncateCompletionChars: number
  readonly truncateToolInputChars: number
  readonly truncateToolOutputChars: number
  readonly truncateAttributeChars: number
}

/** Fully resolved batching policy. */
export interface ResolvedBatch {
  readonly maxRecords: number
  readonly flushIntervalMs: number
  readonly maxQueueRecords: number
  readonly maxBufferRecords: number
  readonly bufferRetryIntervalMs: number
}

/** Fully resolved retry policy. */
export interface ResolvedRetry {
  readonly maxAttempts: number
  readonly baseDelayMs: number
  readonly factor: number
  readonly maxDelayMs: number
}

/** Fully resolved OTLP backend. */
export interface ResolvedOtlp {
  readonly endpoint: string
  readonly serviceName: string
  readonly serviceVersion: string | undefined
  readonly headers: Readonly<Record<string, string>>
  readonly timeoutMs: number
}

/** Fully resolved Langfuse backend. */
export interface ResolvedLangfuse {
  readonly baseUrl: string
  readonly publicKey: string
  readonly secretKey: string
  readonly release: string | undefined
  readonly timeoutMs: number
}

/** The complete resolved config handed to the runtime. */
export interface ResolvedConfig {
  readonly enabled: boolean
  readonly otlp: ResolvedOtlp | undefined
  readonly langfuse: ResolvedLangfuse | undefined
  readonly capture: ResolvedCapture
  readonly llm: ResolvedLlmCapture
  readonly metadata: ResolvedMetadata
  readonly metrics: ResolvedMetrics
  readonly pricing: readonly PricingRule[]
  readonly sanitize: ResolvedSanitize
  readonly batch: ResolvedBatch
  readonly retry: ResolvedRetry
  readonly remote: boolean
}

/** Schemastery schema: the loader validates and fills defaults before `apply`. */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(false),
  otlp: z.union([z.object({
    endpoint: z.string().required(),
    serviceName: z.string().default('deepseek-harness'),
    serviceVersion: z.string(),
    headers: z.dict(z.string()).default({}),
    timeoutMs: z.number().default(10_000),
  }), z.const(null)]).default(null),
  langfuse: z.union([z.object({
    baseUrl: z.string().default('https://cloud.langfuse.com'),
    publicKey: z.string().required(),
    secretKey: z.string().required(),
    release: z.string(),
    timeoutMs: z.number().default(10_000),
  }), z.const(null)]).default(null),
  capture: z.object({
    turns: z.boolean().default(true),
    steps: z.boolean().default(true),
    tools: z.boolean().default(true),
    llm: z.boolean().default(true),
  }).default({ turns: true, steps: true, tools: true, llm: true }),
  llm: z.object({
    prompt: z.boolean().default(true),
    completion: z.boolean().default(true),
  }).default({ prompt: true, completion: true }),
  metadata: z.object({
    sessionId: z.boolean().default(true),
    cwd: z.boolean().default(false),
    agentPreset: z.boolean().default(true),
    model: z.boolean().default(true),
  }).default({ sessionId: true, cwd: false, agentPreset: true, model: true }),
  metrics: z.object({
    tokens: z.boolean().default(true),
    cost: z.boolean().default(true),
    contextTokens: z.boolean().default(true),
  }).default({ tokens: true, cost: true, contextTokens: true }),
  pricing: z.array(z.object({
    provider: z.string(),
    model: z.string().required(),
    inputPerToken: z.number().required(),
    outputPerToken: z.number().required(),
    cacheReadPerToken: z.number(),
    cacheWritePerToken: z.number(),
  })).default([]),
  sanitize: z.object({
    enabled: z.boolean().default(true),
    redactKeys: z.array(z.string()).default([]),
    redactPatterns: z.array(z.string()).default([]),
    truncatePromptChars: z.number().default(4_000),
    truncateCompletionChars: z.number().default(4_000),
    truncateToolInputChars: z.number().default(2_000),
    truncateToolOutputChars: z.number().default(2_000),
    truncateAttributeChars: z.number().default(512),
  }).default({
    enabled: true,
    redactKeys: [],
    redactPatterns: [],
    truncatePromptChars: 4_000,
    truncateCompletionChars: 4_000,
    truncateToolInputChars: 2_000,
    truncateToolOutputChars: 2_000,
    truncateAttributeChars: 512,
  }),
  batch: z.object({
    maxRecords: z.number().default(256),
    flushIntervalMs: z.number().default(5_000),
    maxQueueRecords: z.number().default(2_000),
    maxBufferRecords: z.number().default(10_000),
    bufferRetryIntervalMs: z.number().default(30_000),
  }).default({
    maxRecords: 256,
    flushIntervalMs: 5_000,
    maxQueueRecords: 2_000,
    maxBufferRecords: 10_000,
    bufferRetryIntervalMs: 30_000,
  }),
  retry: z.object({
    maxAttempts: z.number().default(5),
    baseDelayMs: z.number().default(1_000),
    factor: z.number().default(2),
    maxDelayMs: z.number().default(60_000),
  }).default({ maxAttempts: 5, baseDelayMs: 1_000, factor: 2, maxDelayMs: 60_000 }),
  remote: z.object({
    enabled: z.boolean().default(false),
  }).default({ enabled: false }),
})

/** The redaction key substrings always applied, even with an empty `redactKeys`. */
const ALWAYS_REDACT_KEYS = ['key', 'token', 'secret', 'password', 'authorization', 'credential'] as const

/** Built-in secret patterns applied before the configured `redactPatterns`. */
const BUILTIN_REDACT_PATTERNS = [
  /\bsk-[A-Za-z0-9]{16,}\b/u,
  /\bghp_[A-Za-z0-9]{20,}\b/u,
  /\bgho_[A-Za-z0-9]{20,}\b/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/u,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[A-Za-z0-9+/=\s]*-----END [A-Z ]*PRIVATE KEY-----/u,
] as const

/** Throw unless `value` is a non-negative safe integer. */
function assertNonNegativeInt(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer, got ${String(value)}`)
  }
}

/** Throw unless `value` is a positive safe integer. */
function assertPositiveInt(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer, got ${String(value)}`)
  }
}

/** Throw unless `value` is a finite number in `[min, max]`. */
function assertFiniteRange(name: string, value: number, min: number, max: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new TypeError(`${name} must be a finite number in [${min}, ${max}], got ${String(value)}`)
  }
}

/**
 * Validate an http(s) URL string and normalize it to a clean base (no query,
 * no fragment, no trailing slash).
 * @param name - config key, for the error message.
 * @param value - raw URL value.
 * @returns the normalized base URL.
 */
export function normalizeBaseUrl(name: string, value: string): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch (error) {
    throw new TypeError(`${name} must be a valid URL, got ${JSON.stringify(value)} (${error instanceof Error ? error.message : 'invalid URL'})`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TypeError(`${name} must use http(s), got ${JSON.stringify(parsed.protocol)}`)
  }
  parsed.search = ''
  parsed.hash = ''
  const text = parsed.href.replace(/\/+$/u, '')
  return text
}

/**
 * Validate raw values and fill explicit defaults. Invalid enums, numeric
 * bounds, endpoints, or credentials throw here — misconfiguration fails loud
 * at mount even when the plugin is mounted without the Schemastery loader.
 * `enabled: true` with no backend also throws: an enabled exporter with
 * nowhere to send is a silent black hole, not a valid configuration.
 * @param config - raw (possibly partial) plugin config.
 * @returns the fully resolved config.
 */
export function resolveConfig(config: Config = {}): ResolvedConfig {
  const enabled = config.enabled ?? false

  const otlpRaw = config.otlp ?? null
  const langfuseRaw = config.langfuse ?? null
  if (enabled && otlpRaw === null && langfuseRaw === null) {
    throw new TypeError('enabled: true requires at least one backend (otlp or langfuse)')
  }

  const otlp: ResolvedOtlp | undefined = otlpRaw === null ? undefined : (() => {
    const endpoint = normalizeBaseUrl('otlp.endpoint', otlpRaw.endpoint)
    if (endpoint.endsWith('/v1/traces') || endpoint.endsWith('/v1/metrics')) {
      throw new TypeError('otlp.endpoint must be the OTLP base URL (e.g. http://localhost:4318); /v1/traces and /v1/metrics are appended')
    }
    if ((otlpRaw.serviceName ?? 'deepseek-harness').trim().length === 0) {
      throw new TypeError('otlp.serviceName must be a non-empty string')
    }
    const timeoutMs = otlpRaw.timeoutMs ?? 10_000
    assertPositiveInt('otlp.timeoutMs', timeoutMs)
    return {
      endpoint,
      serviceName: (otlpRaw.serviceName ?? 'deepseek-harness').trim(),
      serviceVersion: otlpRaw.serviceVersion === undefined ? undefined : otlpRaw.serviceVersion,
      headers: { ...otlpRaw.headers },
      timeoutMs,
    }
  })()

  const langfuse: ResolvedLangfuse | undefined = langfuseRaw === null ? undefined : (() => {
    const baseUrl = normalizeBaseUrl('langfuse.baseUrl', langfuseRaw.baseUrl ?? 'https://cloud.langfuse.com')
    if (langfuseRaw.publicKey.trim().length === 0) {
      throw new TypeError('langfuse.publicKey must be a non-empty string')
    }
    if (langfuseRaw.secretKey.trim().length === 0) {
      throw new TypeError('langfuse.secretKey must be a non-empty string')
    }
    const timeoutMs = langfuseRaw.timeoutMs ?? 10_000
    assertPositiveInt('langfuse.timeoutMs', timeoutMs)
    return {
      baseUrl,
      publicKey: langfuseRaw.publicKey.trim(),
      secretKey: langfuseRaw.secretKey.trim(),
      release: langfuseRaw.release === undefined ? undefined : langfuseRaw.release,
      timeoutMs,
    }
  })()

  const captureRaw = config.capture ?? {}
  const llmRaw = config.llm ?? {}
  const metadataRaw = config.metadata ?? {}
  const metricsRaw = config.metrics ?? {}

  const batchRaw = config.batch ?? {}
  const batch = {
    maxRecords: batchRaw.maxRecords ?? 256,
    flushIntervalMs: batchRaw.flushIntervalMs ?? 5_000,
    maxQueueRecords: batchRaw.maxQueueRecords ?? 2_000,
    maxBufferRecords: batchRaw.maxBufferRecords ?? 10_000,
    bufferRetryIntervalMs: batchRaw.bufferRetryIntervalMs ?? 30_000,
  }
  assertPositiveInt('batch.maxRecords', batch.maxRecords)
  assertPositiveInt('batch.flushIntervalMs', batch.flushIntervalMs)
  assertPositiveInt('batch.maxQueueRecords', batch.maxQueueRecords)
  assertPositiveInt('batch.maxBufferRecords', batch.maxBufferRecords)
  assertPositiveInt('batch.bufferRetryIntervalMs', batch.bufferRetryIntervalMs)

  const retryRaw = config.retry ?? {}
  const retry = {
    maxAttempts: retryRaw.maxAttempts ?? 5,
    baseDelayMs: retryRaw.baseDelayMs ?? 1_000,
    maxDelayMs: retryRaw.maxDelayMs ?? 60_000,
  }
  assertPositiveInt('retry.maxAttempts', retry.maxAttempts)
  assertPositiveInt('retry.baseDelayMs', retry.baseDelayMs)
  assertPositiveInt('retry.maxDelayMs', retry.maxDelayMs)
  assertFiniteRange('retry.factor', retryRaw.factor ?? 2, 1, 1_000)

  const sanitizeRaw = config.sanitize ?? {}
  const sanitize = {
    enabled: sanitizeRaw.enabled ?? true,
    redactKeys: [...ALWAYS_REDACT_KEYS, ...(sanitizeRaw.redactKeys ?? [])],
    redactPatterns: compilePatterns([
      ...BUILTIN_REDACT_PATTERNS.map(pattern => pattern.source),
      ...(sanitizeRaw.redactPatterns ?? []),
    ]),
    truncatePromptChars: sanitizeRaw.truncatePromptChars ?? 4_000,
    truncateCompletionChars: sanitizeRaw.truncateCompletionChars ?? 4_000,
    truncateToolInputChars: sanitizeRaw.truncateToolInputChars ?? 2_000,
    truncateToolOutputChars: sanitizeRaw.truncateToolOutputChars ?? 2_000,
    truncateAttributeChars: sanitizeRaw.truncateAttributeChars ?? 512,
  }
  assertNonNegativeInt('sanitize.truncatePromptChars', sanitize.truncatePromptChars)
  assertNonNegativeInt('sanitize.truncateCompletionChars', sanitize.truncateCompletionChars)
  assertNonNegativeInt('sanitize.truncateToolInputChars', sanitize.truncateToolInputChars)
  assertNonNegativeInt('sanitize.truncateToolOutputChars', sanitize.truncateToolOutputChars)
  assertPositiveInt('sanitize.truncateAttributeChars', sanitize.truncateAttributeChars)

  const pricing = (config.pricing ?? []).map((rule, index) => {
    if (typeof rule.model !== 'string' || rule.model.trim().length === 0) {
      throw new TypeError(`pricing[${index}].model must be a non-empty string`)
    }
    if (typeof rule.inputPerToken !== 'number' || !Number.isFinite(rule.inputPerToken) || rule.inputPerToken < 0) {
      throw new TypeError(`pricing[${index}].inputPerToken must be a non-negative finite number`)
    }
    if (typeof rule.outputPerToken !== 'number' || !Number.isFinite(rule.outputPerToken) || rule.outputPerToken < 0) {
      throw new TypeError(`pricing[${index}].outputPerToken must be a non-negative finite number`)
    }
    return {
      ...(rule.provider === undefined ? {} : { provider: rule.provider }),
      model: rule.model.trim(),
      inputPerToken: rule.inputPerToken,
      outputPerToken: rule.outputPerToken,
      ...(rule.cacheReadPerToken === undefined ? {} : { cacheReadPerToken: rule.cacheReadPerToken }),
      ...(rule.cacheWritePerToken === undefined ? {} : { cacheWritePerToken: rule.cacheWritePerToken }),
    }
  })

  return {
    enabled,
    otlp,
    langfuse,
    capture: {
      turns: captureRaw.turns ?? true,
      steps: captureRaw.steps ?? true,
      tools: captureRaw.tools ?? true,
      llm: captureRaw.llm ?? true,
    },
    llm: {
      prompt: llmRaw.prompt ?? true,
      completion: llmRaw.completion ?? true,
    },
    metadata: {
      sessionId: metadataRaw.sessionId ?? true,
      cwd: metadataRaw.cwd ?? false,
      agentPreset: metadataRaw.agentPreset ?? true,
      model: metadataRaw.model ?? true,
    },
    metrics: {
      tokens: metricsRaw.tokens ?? true,
      cost: metricsRaw.cost ?? true,
      contextTokens: metricsRaw.contextTokens ?? true,
    },
    pricing,
    sanitize,
    batch,
    retry: { ...retry, factor: retryRaw.factor ?? 2 },
    remote: config.remote?.enabled ?? false,
  }
}

/** Compile user regexes at mount; an invalid pattern fails loud before any export runs. */
function compilePatterns(patterns: readonly string[]): RegExp[] {
  return patterns.map((pattern, index) => {
    try {
      return new RegExp(pattern, 'gu')
    } catch (error) {
      throw new TypeError(`sanitize.redactPatterns[${index}] is not a valid regular expression: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
}
