/**
 * The delivery pipeline over a scripted sink and the REAL durable spool
 * (storage-domain + json backend): size-triggered and manual flushes, queue
 * overflow spilling, backoff retry, retry-exhaustion spooling, spool
 * draining, the runtime kill switch, and the final-flush disposal.
 * @module dsh-observe/test/pipeline.spec
 */

import { describe, expect, it, vi } from 'vitest'
import type { ResolvedBatch, ResolvedRetry } from '../src/config.ts'
import type { ExportRecord, MetricRecord, SpanRecord } from '../src/model.ts'
import { Pipeline } from '../src/pipeline.ts'
import { openSpool, observeDomainSpec, type Spool } from '../src/spool.ts'
import type { SpanSink } from '../src/sinks.ts'
import { mountBase, unmountBase } from './harness.ts'

function span(overrides: Partial<SpanRecord> = {}): SpanRecord {
  return {
    kind: 'turn',
    sessionId: 's1',
    turn: 1,
    startUnixNano: 1,
    endUnixNano: 2,
    attributes: {},
    status: 'ok',
    ...overrides,
  }
}

function record(spanRecord: SpanRecord): ExportRecord {
  return { kind: 'span', span: spanRecord }
}

const batch: ResolvedBatch = {
  maxRecords: 2,
  flushIntervalMs: 60_000,
  maxQueueRecords: 4,
  maxBufferRecords: 100,
  bufferRetryIntervalMs: 60_000,
}

const retry: ResolvedRetry = { maxAttempts: 3, baseDelayMs: 10, factor: 2, maxDelayMs: 1_000 }

/** A sink whose every call is scripted. */
class ScriptedSink implements SpanSink {
  readonly name = 'otlp' as const
  calls: ExportRecord[][] = []
  fail = false

  async exportSpans(records: readonly ExportRecord[]): Promise<void> {
    this.calls.push([...records])
    if (this.fail) throw new Error('boom')
  }
}

function makePipeline(
  sink: ScriptedSink,
  spool: Spool,
  overrides: { enabled?: boolean; batch?: ResolvedBatch } = {},
  onMetric: (metric: MetricRecord) => void = () => undefined,
): Pipeline {
  return new Pipeline({
    name: 'otlp',
    sink,
    spool,
    batch: overrides.batch ?? batch,
    retry,
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    isEnabled: () => overrides.enabled ?? true,
    onMetric,
  })
}

/** Open the real `observe` domain over the harness storage and hand out a spool. */
async function openSpoolOn(base: Awaited<ReturnType<typeof mountBase>>, maxBufferRecords = 100) {
  const domain = await base.ctx.storageDomain.open(observeDomainSpec)
  const spool = openSpool(domain, maxBufferRecords, () => undefined, () => undefined)
  return { spool, close: () => domain.close() }
}

describe('pipeline flush behavior', () => {
  it('flushes the queue head on tick and keeps the rest queued', async () => {
    const base = await mountBase('pipeline-tick')
    try {
      const { spool, close } = await openSpoolOn(base)
      const sink = new ScriptedSink()
      const pipeline = makePipeline(sink, spool)
      pipeline.push(record(span({ turn: 1 })))
      pipeline.push(record(span({ turn: 2 })))
      pipeline.push(record(span({ turn: 3 })))
      await pipeline.tick()
      expect(sink.calls).toHaveLength(1)
      expect(sink.calls[0]).toHaveLength(2)
      expect(pipeline.depth).toBe(1)
      await close()
    } finally {
      await unmountBase(base)
    }
  })

  it('kicks a flush as soon as the queue reaches the batch size', async () => {
    const base = await mountBase('pipeline-kick')
    try {
      const { spool, close } = await openSpoolOn(base)
      const sink = new ScriptedSink()
      const pipeline = makePipeline(sink, spool)
      pipeline.push(record(span({ turn: 1 })))
      pipeline.push(record(span({ turn: 2 })))
      await vi.waitFor(() => expect(sink.calls).toHaveLength(1))
      await close()
    } finally {
      await unmountBase(base)
    }
  })

  it('spills excess records into the durable buffer when the queue is full', async () => {
    const base = await mountBase('pipeline-spill')
    try {
      const { spool, close } = await openSpoolOn(base)
      const sink = new ScriptedSink()
      const pipeline = makePipeline(sink, spool, { batch: { ...batch, maxRecords: 10, maxQueueRecords: 1 } })
      pipeline.push(record(span({ turn: 1 })))
      pipeline.push(record(span({ turn: 2 })))
      await vi.waitFor(() => expect(spool.counts().otlp.records).toBe(1))
      expect(spool.counts().otlp.batches).toBe(1)
      await close()
    } finally {
      await unmountBase(base)
    }
  })

  it('drops records with a metric when the runtime kill switch is off', async () => {
    const base = await mountBase('pipeline-disabled')
    try {
      const { spool, close } = await openSpoolOn(base)
      const sink = new ScriptedSink()
      const metrics: MetricRecord[] = []
      const pipeline = makePipeline(sink, spool, { enabled: false }, metric => metrics.push(metric))
      pipeline.push(record(span({ turn: 1 })))
      expect(pipeline.depth).toBe(0)
      expect(metrics).toContainEqual(expect.objectContaining({ name: 'observe.dropped', attributes: { reason: 'disabled', backend: 'otlp' } }))
      await close()
    } finally {
      await unmountBase(base)
    }
  })
})

describe('pipeline retry and spool drain', () => {
  it('retries a failed batch with backoff and succeeds', async () => {
    vi.useFakeTimers()
    try {
      const base = await mountBase('pipeline-retry')
      try {
        const { spool, close } = await openSpoolOn(base)
        const sink = new ScriptedSink()
        sink.fail = true
        const pipeline = makePipeline(sink, spool)
        pipeline.push(record(span({ turn: 1 })))
        await pipeline.tick() // attempt 1 fails and schedules the 20ms retry
        expect(sink.calls).toHaveLength(1)
        expect(pipeline.depth).toBe(1)
        sink.fail = false
        await vi.advanceTimersByTimeAsync(20) // backoff(1) = 10 * 2 = 20ms
        await vi.waitFor(() => expect(sink.calls).toHaveLength(2))
        expect(pipeline.depth).toBe(0)
        await close()
      } finally {
        await unmountBase(base)
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('spools the batch after retries are exhausted and reports the metric', async () => {
    vi.useFakeTimers()
    try {
      const base = await mountBase('pipeline-exhausted')
      try {
        const { spool, close } = await openSpoolOn(base)
        const sink = new ScriptedSink()
        sink.fail = true
        const metrics: MetricRecord[] = []
        const pipeline = makePipeline(sink, spool, {}, metric => metrics.push(metric))
        pipeline.push(record(span({ turn: 1 })))
        // Attempt 1 fails immediately; retries at 20ms and 40ms, then the
        // third consecutive failure spools the batch (maxAttempts = 3).
        await pipeline.tick()
        await vi.advanceTimersByTimeAsync(20)
        await vi.advanceTimersByTimeAsync(40)
        await vi.waitFor(() => expect(metrics.some(metric => metric.name === 'observe.spooled')).toBe(true))
        expect(spool.counts().otlp.records).toBe(1)
        expect(pipeline.depth).toBe(0)
        await close()
      } finally {
        await unmountBase(base)
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('drains buffered batches on drainSpool and deletes delivered ones', async () => {
    const base = await mountBase('pipeline-drain')
    try {
      const { spool, close } = await openSpoolOn(base)
      await spool.push('otlp', [record(span({ turn: 9 }))])
      const sink = new ScriptedSink()
      const pipeline = makePipeline(sink, spool)
      await pipeline.drainSpool()
      expect(sink.calls).toHaveLength(1)
      expect(spool.counts().otlp.records).toBe(0)
      await close()
    } finally {
      await unmountBase(base)
    }
  })
})

describe('pipeline disposal', () => {
  it('final-flushes the queue and spills what the backend cannot take', async () => {
    const base = await mountBase('pipeline-dispose')
    try {
      const { spool, close } = await openSpoolOn(base)
      const sink = new ScriptedSink()
      sink.fail = true
      const pipeline = makePipeline(sink, spool)
      pipeline.push(record(span({ turn: 1 })))
      await pipeline.dispose()
      expect(spool.counts().otlp.records).toBe(1)
      expect(sink.calls).toHaveLength(1)
      await close()
    } finally {
      await unmountBase(base)
    }
  })

  it('exports the queued batch on dispose when the backend is healthy', async () => {
    const base = await mountBase('pipeline-dispose-ok')
    try {
      const { spool, close } = await openSpoolOn(base)
      const sink = new ScriptedSink()
      const pipeline = makePipeline(sink, spool)
      pipeline.push(record(span({ turn: 1 })))
      await pipeline.dispose()
      expect(sink.calls).toHaveLength(1)
      expect(spool.counts().otlp.records).toBe(0)
      await close()
    } finally {
      await unmountBase(base)
    }
  })
})
