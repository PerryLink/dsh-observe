/**
 * The session/event collector over a REAL Session from the 0.1.1-rc.2 peers:
 * turn/step/tool/llm span lifecycles, retry derivation, missing-closer error
 * closure, sanitized prompt/completion capture, usage/cost metrics, and the
 * optional token-meter context gauge. No mocked harness services.
 * @module dsh-observe/test/collector.spec
 */

import { createAssistantMessage, createToolResultMessage, createUserMessage } from '@deepseek-ai/dsh-llm/message'
import type { Session, SessionEvent, SessionEventMap, SessionEventType } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import { resolveConfig, type Config } from '../src/config.ts'
import { Collector, type TokenMeterService } from '../src/collector.ts'
import type { MetricRecord, SpanRecord } from '../src/model.ts'
import { REDACTED } from '../src/sanitize.ts'
import { CallId } from './call-id.ts'
import { mountBase, unmountBase } from './harness.ts'

/** Drive one collector over a real session; events append for real. */
function drive(session: Session, config: Config = {}, meter?: () => TokenMeterService | undefined) {
  const resolved = resolveConfig(config)
  const spans: SpanRecord[] = []
  const metrics: MetricRecord[] = []
  const collector = new Collector(
    resolved,
    meter ?? (() => undefined),
    span => spans.push(span),
    metric => metrics.push(metric),
    { info: () => undefined, warn: () => undefined, error: () => undefined },
  )
  const handle = (event: SessionEvent): void => {
    collector.handleEvent(session, event)
  }
  return { collector, spans, metrics, handle }
}

/** Append one typed event for real and feed it to the collector. */
function feed<T extends SessionEventType>(
  session: Session,
  handle: (event: SessionEvent) => void,
  type: T,
  data: SessionEventMap[T],
): void {
  const append = session.append as unknown as (eventType: string, eventData: unknown) => SessionEvent
  handle(append.call(session, type, data))
}

/** Append one message-producing surface event (carries its surfaceOp marker). */
function feedSurface<T extends SessionEventType>(
  session: Session,
  handle: (event: SessionEvent) => void,
  type: T,
  data: SessionEventMap[T],
): void {
  // The rc.2 Session requires a SurfaceIntent on message-producing events;
  // the harness emits plain appends (no replacement ever happens here).
  const append = session.append as unknown as (
    eventType: string,
    eventData: unknown,
    opts: { surfaceOp: 'append' },
  ) => SessionEvent
  handle(append.call(session, type, data, { surfaceOp: 'append' }))
}

/** The standard happy-path log one test family drives. */
function happyPath(session: Session, handle: (event: SessionEvent) => void): void {
  feed(session, handle, 'turn/start', { turn: 1 })
  feedSurface(session, handle, 'user/message', createUserMessage({
    content: [{ type: 'text', text: 'hello' }],
    source: { kind: 'user' },
  }))
  feed(session, handle, 'step/start', { turn: 1, step: 1 })
  feed(session, handle, 'request/header', {
    header: { config: { provider: 'deepseek', model: 'deepseek-chat' }, system: 'You are helpful. token sk-abc12345678901234' },
    reason: 'initial',
  })
  feed(session, handle, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: 'Hi' } })
  feed(session, handle, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'finish', reason: { kind: 'stop' } } })
  feed(session, handle, 'tool/call', { turn: 1, step: 1, callId: CallId('c1'), name: 'bash', arguments: '{"command":"ls","api_key":"secret-value"}' })
  feedSurface(session, handle, 'tool/result', {
    turn: 1,
    step: 1,
    message: createToolResultMessage({ callId: CallId('c1'), content: [{ type: 'text', text: 'file.txt' }], isError: false }),
  })
  feedSurface(session, handle, 'assistant/message', {
    turn: 1,
    step: 1,
    message: createAssistantMessage({
      content: [{ type: 'text', text: 'I ran it.' }],
      source: { provider: 'deepseek', model: 'deepseek-chat' },
    }),
    usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 20, reasoningTokens: 10 },
  })
  feed(session, handle, 'step/end', { turn: 1, step: 1 })
  feed(session, handle, 'turn/end', { turn: 1, reason: { kind: 'completed' } })
}

describe('collector happy path', () => {
  it('closes turn, step, tool, and llm spans with sanitized payloads and metrics', async () => {
    const base = await mountBase('collector-happy')
    try {
      const { spans, metrics, handle } = drive(base.session, {
        enabled: true,
        otlp: { endpoint: 'http://collector:4318' },
        pricing: [{ provider: 'deepseek', model: '*', inputPerToken: 0.000001, outputPerToken: 0.000002 }],
      })
      happyPath(base.session, handle)

      const turn = spans.find(span => span.kind === 'turn')
      expect(turn?.status).toBe('ok')
      expect(turn?.attributes['turn.reason']).toBe('completed')

      const step = spans.find(span => span.kind === 'step')
      expect(step?.status).toBe('ok')
      expect(step?.attributes.provider).toBe('deepseek')
      expect(step?.attributes.model).toBe('deepseek-chat')

      const tool = spans.find(span => span.kind === 'tool')
      expect(tool?.tool?.name).toBe('bash')
      expect(tool?.status).toBe('ok')
      expect(tool?.tool?.attempt).toBe(1)
      expect(tool?.tool?.retries).toBe(0)
      expect(tool?.tool?.input).toContain(`"api_key":"${REDACTED}"`)
      expect(tool?.tool?.output).toBe('file.txt')

      const llm = spans.find(span => span.kind === 'llm')
      expect(llm?.llm?.usage).toEqual({ input: 100, output: 50, cacheRead: 20, cacheWrite: 0, reasoning: 10 })
      expect(llm?.llm?.finishReason).toBe('stop')
      expect(typeof llm?.llm?.ttftMs).toBe('number')
      expect(llm?.llm?.input).toContain(REDACTED)
      expect(llm?.llm?.input).not.toContain('sk-live-abc12345xyz')
      expect(llm?.llm?.costUsd).toBeCloseTo(100 * 1e-6 + 50 * 2e-6 + 20 * 1e-6, 12)

      expect(metrics.some(metric => metric.name === 'observe.tokens' && metric.attributes.kind === 'input')).toBe(true)
      expect(metrics.some(metric => metric.name === 'observe.cost')).toBe(true)

      // Spans are exported in close order: tool closes before step, step before turn.
      expect(spans.findIndex(span => span.kind === 'turn')).toBeGreaterThan(spans.findIndex(span => span.kind === 'step'))
    } finally {
      await unmountBase(base)
    }
  })

  it('recovers finish reason and first-token timing from the v2 embedded stream', async () => {
    const base = await mountBase('collector-v2-stream')
    try {
      const { spans, handle } = drive(base.session, { enabled: true, otlp: { endpoint: 'http://x' } })
      feed(base.session, handle, 'turn/start', { turn: 1 })
      feed(base.session, handle, 'step/start', { turn: 1, step: 1 })
      feed(base.session, handle, 'request/header', {
        header: { config: { provider: 'deepseek', model: 'deepseek-chat' }, system: 'sys' },
        reason: 'initial',
      })
      // 0.1.3-alpha.1 carries the whole stream inside assistant/message and
      // never emits assistant/chunk; the pinned rc.1 runtime accepts the
      // extra JSON key, so the fixture rides a real append roundtrip.
      const v2Data = {
        turn: 1,
        step: 1,
        message: createAssistantMessage({
          content: [{ type: 'text', text: 'Hi!' }],
          source: { provider: 'deepseek', model: 'deepseek-chat' },
        }),
        usage: { inputTokens: 10, outputTokens: 5 },
        stream: [
          { type: 'text-chunks', time0: Date.now() + 500, index: 0, dt: [1], texts: ['Hi', '!'] },
          { type: 'chunk', time: Date.now() + 510, chunk: { type: 'finish', reason: { kind: 'stop' } } },
        ],
      }
      feedSurface(base.session, handle, 'assistant/message', v2Data as unknown as SessionEventMap['assistant/message'])
      feed(base.session, handle, 'step/end', { turn: 1, step: 1 })
      feed(base.session, handle, 'turn/end', { turn: 1, reason: { kind: 'completed' } })

      const llm = spans.find(span => span.kind === 'llm')
      expect(llm?.llm?.finishReason).toBe('stop')
      expect(typeof llm?.llm?.ttftMs).toBe('number')
      expect(llm?.llm?.ttftMs).toBeGreaterThanOrEqual(0)
    } finally {
      await unmountBase(base)
    }
  })

  it('derives retries from repeated identical tool calls in one step', async () => {
    const base = await mountBase('collector-retry')
    try {
      const { spans, handle } = drive(base.session, { enabled: true, otlp: { endpoint: 'http://x' } })
      feed(base.session, handle, 'turn/start', { turn: 1 })
      feed(base.session, handle, 'step/start', { turn: 1, step: 1 })
      const args = '{"command":"ls"}'
      feed(base.session, handle, 'tool/call', { turn: 1, step: 1, callId: CallId('c1'), name: 'bash', arguments: args })
      feed(base.session, handle, 'tool/call', { turn: 1, step: 1, callId: CallId('c2'), name: 'bash', arguments: args })
      feedSurface(base.session, handle, 'tool/result', { turn: 1, step: 1, message: createToolResultMessage({ callId: CallId('c2'), content: [{ type: 'text', text: 'ok' }], isError: false }) })
      feed(base.session, handle, 'step/end', { turn: 1, step: 1 })
      feed(base.session, handle, 'turn/end', { turn: 1, reason: { kind: 'completed' } })

      const tools = spans.filter(span => span.kind === 'tool')
      expect(tools).toHaveLength(2)
      // The result closes c2 first; c1 stays open until step/end closes it.
      const c2 = tools.find(span => span.callId === CallId('c2'))
      const c1 = tools.find(span => span.callId === CallId('c1'))
      expect(c1?.tool?.attempt).toBe(1)
      expect(c1?.tool?.retries).toBe(0)
      expect(c2?.tool?.attempt).toBe(2)
      expect(c2?.tool?.retries).toBe(1)
    } finally {
      await unmountBase(base)
    }
  })
})

describe('collector first-token detection', () => {
  it('marks the first non-empty delta of each kind as the first token', async () => {
    const base = await mountBase('collector-first-token')
    try {
      const { spans, handle } = drive(base.session, { enabled: true, otlp: { endpoint: 'http://x' } })
      feed(base.session, handle, 'turn/start', { turn: 1 })
      const steps: [number, SessionEventMap['assistant/chunk']['chunk']][] = [
        [1, { type: 'reasoning-delta', index: 0, text: 'thinking' }],
        [2, { type: 'tool-call-delta', index: 0, id: CallId('t1'), name: 'bash', argumentsDelta: '' }],
        [3, { type: 'tool-call-delta', index: 0, id: CallId('t2'), argumentsDelta: '{"a":1}' }],
      ]
      for (const [step, chunk] of steps) {
        feed(base.session, handle, 'step/start', { turn: 1, step })
        feed(base.session, handle, 'request/header', { header: { config: { provider: 'p', model: 'm' } }, reason: 'initial' })
        feed(base.session, handle, 'assistant/chunk', { turn: 1, step, chunk })
        feedSurface(base.session, handle, 'assistant/message', {
          turn: 1,
          step,
          message: createAssistantMessage({ content: [{ type: 'text', text: 'ok' }], source: { provider: 'p', model: 'm' } }),
        })
        feed(base.session, handle, 'step/end', { turn: 1, step })
      }
      feed(base.session, handle, 'turn/end', { turn: 1, reason: { kind: 'completed' } })

      const llms = spans.filter(span => span.kind === 'llm')
      expect(llms).toHaveLength(3)
      for (const llm of llms) expect(typeof llm.llm?.ttftMs).toBe('number')
    } finally {
      await unmountBase(base)
    }
  })

  it('ignores empty deltas and non-delta chunks as the first token', async () => {
    const base = await mountBase('collector-first-token-empty')
    try {
      const { spans, handle } = drive(base.session, { enabled: true, otlp: { endpoint: 'http://x' } })
      feed(base.session, handle, 'turn/start', { turn: 1 })
      feed(base.session, handle, 'step/start', { turn: 1, step: 1 })
      feed(base.session, handle, 'request/header', { header: { config: { provider: 'p', model: 'm' } }, reason: 'initial' })
      feed(base.session, handle, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'text-delta', index: 0, text: '' } })
      feed(base.session, handle, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'block-start', index: 0, blockType: 'text' } })
      feed(base.session, handle, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'reasoning-delta', index: 0, text: '' } })
      feed(base.session, handle, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'usage', usage: { inputTokens: 0, outputTokens: 0 } } })
      feed(base.session, handle, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'tool-call-delta', index: 0, id: CallId('t1'), argumentsDelta: '' } })
      feed(base.session, handle, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'block-end', index: 0, block: { type: 'text', text: '' } } })
      feed(base.session, handle, 'assistant/chunk', { turn: 1, step: 1, chunk: { type: 'finish', reason: { kind: 'stop' } } })
      feedSurface(base.session, handle, 'assistant/message', {
        turn: 1,
        step: 1,
        message: createAssistantMessage({ content: [{ type: 'text', text: 'ok' }], source: { provider: 'p', model: 'm' } }),
      })
      feed(base.session, handle, 'step/end', { turn: 1, step: 1 })
      feed(base.session, handle, 'turn/end', { turn: 1, reason: { kind: 'completed' } })

      const llm = spans.find(span => span.kind === 'llm')
      expect(llm?.status).toBe('ok')
      expect(llm?.llm?.finishReason).toBe('stop')
      expect(llm?.llm?.ttftMs).toBeUndefined()
    } finally {
      await unmountBase(base)
    }
  })
})

describe('collector missing closers', () => {
  it('closes dangling tool and llm spans with error status at step end', async () => {
    const base = await mountBase('collector-missing')
    try {
      const { spans, handle } = drive(base.session, { enabled: true, otlp: { endpoint: 'http://x' } })
      feed(base.session, handle, 'turn/start', { turn: 1 })
      feed(base.session, handle, 'step/start', { turn: 1, step: 1 })
      feed(base.session, handle, 'request/header', { header: { config: { provider: 'p', model: 'm' } }, reason: 'initial' })
      feed(base.session, handle, 'tool/call', { turn: 1, step: 1, callId: CallId('c9'), name: 'bash', arguments: '{}' })
      feed(base.session, handle, 'step/end', { turn: 1, step: 1 })

      const tool = spans.find(span => span.kind === 'tool')
      expect(tool?.status).toBe('error')
      expect(tool?.tool?.errorCode).toBe('ABORTED')
      expect(tool?.attributes['observe.incomplete']).toBe(true)

      const llm = spans.find(span => span.kind === 'llm')
      expect(llm?.status).toBe('error')
      expect(llm?.attributes['observe.incomplete']).toBe(true)

      const step = spans.find(span => span.kind === 'step')
      expect(step?.status).toBe('ok')
      expect(step?.attributes['observe.aborted']).toBeUndefined()
    } finally {
      await unmountBase(base)
    }
  })

  it('closes a turn that never ended with an aborted span when the next turn starts', async () => {
    const base = await mountBase('collector-aborted-turn')
    try {
      const { spans, handle } = drive(base.session, { enabled: true, otlp: { endpoint: 'http://x' } })
      feed(base.session, handle, 'turn/start', { turn: 1 })
      feed(base.session, handle, 'turn/start', { turn: 2 })
      feed(base.session, handle, 'turn/end', { turn: 2, reason: { kind: 'completed' } })

      const turns = spans.filter(span => span.kind === 'turn')
      expect(turns).toHaveLength(2)
      expect(turns[0]?.turn).toBe(1)
      expect(turns[0]?.status).toBe('error')
      expect(turns[0]?.attributes['turn.reason']).toBe('aborted')
      expect(turns[1]?.status).toBe('ok')
    } finally {
      await unmountBase(base)
    }
  })

  it('marks error turns with the structured failure facts', async () => {
    const base = await mountBase('collector-error-turn')
    try {
      const { spans, handle } = drive(base.session, { enabled: true, otlp: { endpoint: 'http://x' } })
      feed(base.session, handle, 'turn/start', { turn: 1 })
      feed(base.session, handle, 'turn/end', { turn: 1, reason: { kind: 'error', error: { message: 'bad key', code: 'AUTH' } } })

      const turn = spans.find(span => span.kind === 'turn')
      expect(turn?.status).toBe('error')
      expect(turn?.attributes['turn.error.code']).toBe('AUTH')
      expect(turn?.attributes['turn.error.message']).toBe('bad key')
    } finally {
      await unmountBase(base)
    }
  })

  it('closes every open span on session disposal', async () => {
    const base = await mountBase('collector-disposed')
    try {
      const { spans, collector, handle } = drive(base.session, { enabled: true, otlp: { endpoint: 'http://x' } })
      feed(base.session, handle, 'turn/start', { turn: 1 })
      feed(base.session, handle, 'step/start', { turn: 1, step: 1 })
      feed(base.session, handle, 'tool/call', { turn: 1, step: 1, callId: CallId('c9'), name: 'bash', arguments: '{}' })
      collector.handleSessionDisposed(base.session)

      expect(spans.some(span => span.kind === 'tool' && span.status === 'error')).toBe(true)
      expect(spans.some(span => span.kind === 'step' && span.attributes['observe.aborted'] === true)).toBe(true)
      const turn = spans.find(span => span.kind === 'turn')
      expect(turn?.status).toBe('error')
      expect(turn?.attributes['turn.reason']).toBe('disposed')
    } finally {
      await unmountBase(base)
    }
  })
})

describe('collector capture switches', () => {
  it('skips tool and llm spans when their capture families are off', async () => {
    const base = await mountBase('collector-switches')
    try {
      const { spans, handle } = drive(base.session, {
        enabled: true,
        otlp: { endpoint: 'http://x' },
        capture: { tools: false, llm: false, turns: true, steps: true },
      })
      happyPath(base.session, handle)
      expect(spans.some(span => span.kind === 'tool')).toBe(false)
      expect(spans.some(span => span.kind === 'llm')).toBe(false)
      expect(spans.some(span => span.kind === 'step')).toBe(true)
    } finally {
      await unmountBase(base)
    }
  })

  it('omits metadata attributes when their switches are off', async () => {
    const base = await mountBase('collector-metadata')
    try {
      const { spans, handle } = drive(base.session, {
        enabled: true,
        otlp: { endpoint: 'http://x' },
        metadata: { sessionId: false, model: false },
      })
      happyPath(base.session, handle)
      const step = spans.find(span => span.kind === 'step')
      expect(step?.attributes['session.id']).toBeUndefined()
      expect(step?.attributes.model).toBeUndefined()
    } finally {
      await unmountBase(base)
    }
  })

  it('emits the context-token gauge from the optional token meter at step end', async () => {
    const base = await mountBase('collector-meter')
    try {
      const { metrics, handle } = drive(base.session, { enabled: true, otlp: { endpoint: 'http://x' } }, () => ({
        measure: () => ({ totalTokens: 42_000, baseline: { kind: 'spill' } }),
      }))
      feed(base.session, handle, 'turn/start', { turn: 1 })
      feed(base.session, handle, 'step/start', { turn: 1, step: 1 })
      feed(base.session, handle, 'step/end', { turn: 1, step: 1 })
      feed(base.session, handle, 'turn/end', { turn: 1, reason: { kind: 'completed' } })

      const gauge = metrics.find(metric => metric.name === 'observe.context_tokens')
      expect(gauge?.kind).toBe('gauge')
      expect(gauge?.value).toBe(42_000)
      expect(gauge?.attributes.baseline).toBe('spill')
    } finally {
      await unmountBase(base)
    }
  })

  it('contains a throwing token meter instead of failing the span flow', async () => {
    const base = await mountBase('collector-meter-throw')
    try {
      const { spans, handle } = drive(base.session, { enabled: true, otlp: { endpoint: 'http://x' } }, () => ({
        measure: () => { throw new Error('meter exploded') },
      }))
      feed(base.session, handle, 'turn/start', { turn: 1 })
      feed(base.session, handle, 'step/start', { turn: 1, step: 1 })
      feed(base.session, handle, 'step/end', { turn: 1, step: 1 })
      feed(base.session, handle, 'turn/end', { turn: 1, reason: { kind: 'completed' } })
      expect(spans.some(span => span.kind === 'step')).toBe(true)
    } finally {
      await unmountBase(base)
    }
  })
})
