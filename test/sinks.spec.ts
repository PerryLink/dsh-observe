/**
 * Export sinks against a scripted global `fetch` (the only external edge the
 * plugin has): OTLP span/metric wire shapes, cumulative counter aggregation,
 * Langfuse trace-create/observation/generation events with Basic auth, and
 * retryable failure surfaces.
 * @module dsh-observe/test/sinks.spec
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ResolvedLangfuse, ResolvedOtlp } from '../src/config.ts'
import type { ExportRecord, MetricRecord, SpanRecord } from '../src/model.ts'
import { LangfuseSink, OtlpSink } from '../src/sinks.ts'

const logger = { info: () => undefined, warn: () => undefined, error: () => undefined }

function span(overrides: Partial<SpanRecord> = {}): SpanRecord {
  return {
    kind: 'turn',
    sessionId: 's1',
    turn: 1,
    startUnixNano: 1_000_000_000,
    endUnixNano: 2_000_000_000,
    attributes: { 'turn.reason': 'completed' },
    status: 'ok',
    ...overrides,
  }
}

function recordOf(spanRecord: SpanRecord): ExportRecord {
  return { kind: 'span', span: spanRecord }
}

function otlpConfig(overrides: Partial<ResolvedOtlp> = {}): ResolvedOtlp {
  return {
    endpoint: 'http://collector:4318',
    serviceName: 'test-service',
    serviceVersion: undefined,
    headers: {},
    timeoutMs: 5_000,
    ...overrides,
  }
}

function langfuseConfig(overrides: Partial<ResolvedLangfuse> = {}): ResolvedLangfuse {
  return {
    baseUrl: 'https://cloud.langfuse.com',
    publicKey: 'pk-test',
    secretKey: 'sk-test',
    release: undefined,
    traceName: 'session {session} turn {turn}',
    tags: [],
    timeoutMs: 5_000,
    ...overrides,
  }
}

/** A fetch stub that records every call and returns scripted responses. */
function installFetch() {
  const calls: Array<{ url: string; init: RequestInit }> = []
  let response: Response | Error = new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    if (response instanceof Error) throw response
    return response.clone() // each consumer gets a fresh, readable body
  })
  vi.stubGlobal('fetch', fetchMock)
  return {
    calls,
    respond(next: Response | Error): void {
      response = next
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OtlpSink exportSpans', () => {
  it('POSTs the trace batch to /v1/traces with the resource and scope', async () => {
    const fetchMock = installFetch()
    const sink = new OtlpSink(otlpConfig(), logger)
    const turn = span()
    await sink.exportSpans([recordOf(turn)])

    expect(fetchMock.calls).toHaveLength(1)
    expect(fetchMock.calls[0]?.url).toBe('http://collector:4318/v1/traces')
    const body = JSON.parse(String(fetchMock.calls[0]?.init.body)) as {
      resourceSpans: Array<{ resource: { attributes: Array<{ key: string; value: Record<string, unknown> }> }; scopeSpans: Array<{ scope: { name: string }; spans: Array<Record<string, unknown>> }> }>
    }
    const resource = body.resourceSpans[0]?.resource
    expect(resource?.attributes).toContainEqual({ key: 'service.name', value: { stringValue: 'test-service' } })
    const scopeSpan = body.resourceSpans[0]?.scopeSpans[0]
    expect(scopeSpan?.scope.name).toBe('dsh-observe')
    expect(scopeSpan?.spans[0]?.name).toBe('turn 1')
    expect(scopeSpan?.spans[0]?.traceId).toMatch(/^[0-9a-f]{32}$/u)
    expect(scopeSpan?.spans[0]?.spanId).toMatch(/^[0-9a-f]{16}$/u)
  })

  it('parent step/tool spans under their step span and marks errors', async () => {
    const fetchMock = installFetch()
    const sink = new OtlpSink(otlpConfig(), logger)
    const step = span({ kind: 'step', step: 1 })
    const tool = span({
      kind: 'tool',
      step: 1,
      callId: 'c1',
      status: 'error',
      tool: { name: 'bash', status: 'error', errorCode: 'ABORTED', attempt: 1, retries: 0 },
    })
    await sink.exportSpans([recordOf(step), recordOf(tool)])
    const body = JSON.parse(String(fetchMock.calls[0]?.init.body)) as {
      resourceSpans: Array<{ scopeSpans: Array<{ spans: Array<Record<string, unknown>> }> }>
    }
    const spans = body.resourceSpans[0]?.scopeSpans[0]?.spans ?? []
    const toolSpan = spans.find(item => item.name === 'tool bash')
    expect(toolSpan?.parentSpanId).toBeDefined()
    expect((toolSpan?.status as { code: number }).code).toBe(2)
  })

  it('fails loudly on non-2xx responses (the pipeline retries)', async () => {
    const fetchMock = installFetch()
    fetchMock.respond(new Response('nope', { status: 500 }))
    const sink = new OtlpSink(otlpConfig(), logger)
    await expect(sink.exportSpans([recordOf(span())])).rejects.toThrow(/responded 500/u)
  })

  it('maps llm spans to gen_ai.* semantic-convention attributes with a CLIENT kind', async () => {
    const fetchMock = installFetch()
    const sink = new OtlpSink(otlpConfig(), logger)
    await sink.exportSpans([recordOf(span({
      kind: 'llm',
      step: 1,
      llm: {
        model: 'deepseek-chat',
        provider: 'deepseek',
        usage: { input: 10, output: 5, cacheRead: 2, cacheWrite: 1, reasoning: 3 },
        finishReason: 'stop',
        ttftMs: 42,
        costUsd: 0.001,
      },
    }))])
    const body = JSON.parse(String(fetchMock.calls[0]?.init.body)) as {
      resourceSpans: Array<{ scopeSpans: Array<{ spans: Array<{ name: string; kind: number; attributes: Array<{ key: string; value: Record<string, unknown> }> }> }> }>
    }
    const llmSpan = body.resourceSpans[0]?.scopeSpans[0]?.spans[0]
    expect(llmSpan?.name).toBe('gen_ai.client.request')
    expect(llmSpan?.kind).toBe(3)
    const attrs = new Map((llmSpan?.attributes ?? []).map(item => [item.key, item.value]))
    expect(attrs.get('gen_ai.operation.name')).toEqual({ stringValue: 'chat' })
    expect(attrs.get('gen_ai.system')).toEqual({ stringValue: 'deepseek' })
    expect(attrs.get('gen_ai.request.model')).toEqual({ stringValue: 'deepseek-chat' })
    expect(attrs.get('gen_ai.response.model')).toEqual({ stringValue: 'deepseek-chat' })
    expect(attrs.get('gen_ai.response.finish_reason')).toEqual({ stringValue: 'stop' })
    expect(attrs.get('gen_ai.client.time_to_first_token')).toEqual({ intValue: '42' })
    expect(attrs.get('gen_ai.usage.input_tokens')).toEqual({ intValue: '10' })
    expect(attrs.get('gen_ai.usage.output_tokens')).toEqual({ intValue: '5' })
    expect(attrs.get('gen_ai.usage.cache_read_tokens')).toEqual({ intValue: '2' })
    expect(attrs.get('gen_ai.usage.cache_write_tokens')).toEqual({ intValue: '1' })
    expect(attrs.get('gen_ai.usage.reasoning_tokens')).toEqual({ intValue: '3' })
  })
})

describe('OtlpSink metrics', () => {
  it('aggregates counters cumulatively and gauges by last write', async () => {
    const fetchMock = installFetch()
    const sink = new OtlpSink(otlpConfig(), logger)
    const counter = (value: number): MetricRecord => ({
      name: 'observe.tokens', kind: 'counter', unit: 'tokens', value,
      attributes: { provider: 'p', model: 'm', kind: 'input' },
    })
    const gauge = (value: number): MetricRecord => ({
      name: 'observe.context_tokens', kind: 'gauge', unit: 'tokens', value,
      attributes: {},
    })
    sink.recordMetric(counter(10))
    sink.recordMetric(counter(15))
    sink.recordMetric(gauge(100))
    sink.recordMetric(gauge(200))
    await sink.flushMetrics()

    expect(fetchMock.calls[0]?.url).toBe('http://collector:4318/v1/metrics')
    const body = JSON.parse(String(fetchMock.calls[0]?.init.body)) as {
      resourceMetrics: Array<{ scopeMetrics: Array<{ metrics: Array<Record<string, unknown>> }> }>
    }
    const metrics = body.resourceMetrics[0]?.scopeMetrics[0]?.metrics ?? []
    const tokenMetric = metrics.find(metric => metric.name === 'observe.tokens')
    const sum = tokenMetric?.sum as { dataPoints: Array<{ asInt: string }>; aggregationTemporality: number; isMonotonic: boolean }
    expect(sum?.dataPoints[0]?.asInt).toBe('25')
    expect(sum?.aggregationTemporality).toBe(2)
    expect(sum?.isMonotonic).toBe(true)
    const gaugeMetric = metrics.find(metric => metric.name === 'observe.context_tokens')
    const gaugeSum = gaugeMetric?.gauge as { dataPoints: Array<{ asInt: string }> }
    expect(gaugeSum?.dataPoints[0]?.asInt).toBe('200')
  })

  it('skips the POST when nothing changed since the last flush', async () => {
    const fetchMock = installFetch()
    const sink = new OtlpSink(otlpConfig(), logger)
    await sink.flushMetrics()
    expect(fetchMock.calls).toHaveLength(0)
  })
})

describe('LangfuseSink', () => {
  it('creates the trace once, observations per span, and signs with Basic auth', async () => {
    const fetchMock = installFetch()
    const sink = new LangfuseSink(langfuseConfig(), logger)
    await sink.exportSpans([recordOf(span()), recordOf(span({ kind: 'step', step: 1 }))])

    const call = fetchMock.calls[0]
    expect(call?.url).toBe('https://cloud.langfuse.com/api/public/ingestion')
    const auth = (call?.init.headers as Record<string, string>)['authorization']
    expect(auth).toBe(`Basic ${Buffer.from('pk-test:sk-test').toString('base64')}`)

    const body = JSON.parse(String(call?.init.body)) as { batch: Array<{ type: string; body: Record<string, unknown> }> }
    expect(body.batch.filter(event => event.type === 'trace-create')).toHaveLength(1)
    expect(body.batch.filter(event => event.type === 'span-create')).toHaveLength(2)

    // A second export of the same trace must not re-create it (upsert idempotence).
    await sink.exportSpans([recordOf(span({ kind: 'tool', step: 1, callId: 'c1', tool: { name: 'bash', status: 'ok', attempt: 1, retries: 0 } }))])
    const second = JSON.parse(String(fetchMock.calls[1]?.init.body)) as { batch: Array<{ type: string }> }
    expect(second.batch.filter(event => event.type === 'trace-create')).toHaveLength(0)
  })

  it('emits generation-create with usage for llm spans', async () => {
    const fetchMock = installFetch()
    const sink = new LangfuseSink(langfuseConfig(), logger)
    await sink.exportSpans([recordOf(span({
      kind: 'llm',
      step: 1,
      llm: { model: 'deepseek-chat', usage: { input: 10, output: 5, cacheRead: 2, cacheWrite: 1, reasoning: 0 }, finishReason: 'stop' },
    }))])
    const body = JSON.parse(String(fetchMock.calls[0]?.init.body)) as { batch: Array<{ type: string; body: Record<string, unknown> }> }
    const generation = body.batch.find(event => event.type === 'generation-create')
    expect(generation?.body.model).toBe('deepseek-chat')
    expect(generation?.body.usage).toEqual({ input: 13, output: 5, total: 18, unit: 'TOKENS' })
  })

  it('throws on non-2xx and on per-event ingestion errors (retryable)', async () => {
    const fetchMock = installFetch()
    const sink = new LangfuseSink(langfuseConfig(), logger)
    fetchMock.respond(new Response('nope', { status: 401 }))
    await expect(sink.exportSpans([recordOf(span())])).rejects.toThrow(/responded 401/u)

    fetchMock.respond(new Response(JSON.stringify({ errors: [{ id: 'e1' }] }), { status: 207, headers: { 'content-type': 'application/json' } }))
    await expect(sink.exportSpans([recordOf(span())])).rejects.toThrow(/event error/u)
  })

  it('stamps the release onto trace-create when configured', async () => {
    const fetchMock = installFetch()
    const sink = new LangfuseSink(langfuseConfig({ release: 'v0.1.0' }), logger)
    await sink.exportSpans([recordOf(span())])
    const body = JSON.parse(String(fetchMock.calls[0]?.init.body)) as { batch: Array<{ type: string; body: Record<string, unknown> }> }
    const trace = body.batch.find(event => event.type === 'trace-create')
    expect(trace?.body.release).toBe('v0.1.0')
  })

  it('interpolates the configured traceName template per trace', async () => {
    const fetchMock = installFetch()
    const sink = new LangfuseSink(langfuseConfig({ traceName: 'agent {session}#{turn}' }), logger)
    await sink.exportSpans([recordOf(span({ sessionId: 'sess-42', turn: 7 }))])
    const body = JSON.parse(String(fetchMock.calls[0]?.init.body)) as { batch: Array<{ type: string; body: Record<string, unknown> }> }
    const trace = body.batch.find(event => event.type === 'trace-create')
    expect(trace?.body.name).toBe('agent sess-42#7')
  })

  it('keeps the default trace name and omits tags when unconfigured', async () => {
    const fetchMock = installFetch()
    const sink = new LangfuseSink(langfuseConfig(), logger)
    await sink.exportSpans([recordOf(span())])
    const body = JSON.parse(String(fetchMock.calls[0]?.init.body)) as { batch: Array<{ type: string; body: Record<string, unknown> }> }
    const trace = body.batch.find(event => event.type === 'trace-create')
    expect(trace?.body.name).toBe('session s1 turn 1')
    expect(trace?.body.tags).toBeUndefined()
  })

  it('stamps the configured tags onto trace-create', async () => {
    const fetchMock = installFetch()
    const sink = new LangfuseSink(langfuseConfig({ tags: ['omdsh', 'coding-agent'] }), logger)
    await sink.exportSpans([recordOf(span())])
    const body = JSON.parse(String(fetchMock.calls[0]?.init.body)) as { batch: Array<{ type: string; body: Record<string, unknown> }> }
    const trace = body.batch.find(event => event.type === 'trace-create')
    expect(trace?.body.tags).toEqual(['omdsh', 'coding-agent'])
  })
})
