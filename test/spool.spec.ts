/**
 * The durable offline buffer over the REAL storage-domain facility + json
 * backend: spill/peek/remove round trips, the record-bound eviction (oldest
 * dropped first), per-backend isolation, invalid-record rejection at the
 * durable boundary, occupancy counts, and sequence resume across reopen.
 * @module dsh-observe/test/spool.spec
 */

import { describe, expect, it } from 'vitest'
import type { ExportRecord } from '../src/model.ts'
import { openSpool, observeDomainSpec } from '../src/spool.ts'
import { mountBase, unmountBase } from './harness.ts'

function record(turn: number, backendFlavor: string): ExportRecord {
  return { kind: 'span', span: { kind: 'turn', sessionId: `s-${backendFlavor}`, turn, startUnixNano: turn, endUnixNano: turn + 1, attributes: {}, status: 'ok' } }
}

async function open(base: Awaited<ReturnType<typeof mountBase>>, maxBufferRecords: number) {
  const domain = await base.ctx.storageDomain.open(observeDomainSpec)
  const dropped: number[] = []
  const invalid: number[] = []
  const spool = openSpool(domain, maxBufferRecords, count => dropped.push(count), count => invalid.push(count))
  return { domain, spool, dropped, invalid }
}

describe('spool round trip', () => {
  it('spills, peeks, and removes one batch', async () => {
    const base = await mountBase('spool-roundtrip')
    try {
      const { domain, spool } = await open(base, 100)
      await spool.push('otlp', [record(1, 'otlp')])
      expect(spool.counts().otlp).toEqual({ batches: 1, records: 1 })

      const peeked = spool.peek('otlp', 10)
      expect(peeked.records).toHaveLength(1)
      expect(peeked.batches[0]?.key.startsWith('otlp:')).toBe(true)

      await spool.remove(peeked.batches)
      expect(spool.counts().otlp).toEqual({ batches: 0, records: 0 })
      await domain.close()
    } finally {
      await unmountBase(base)
    }
  })

  it('isolates backends by prefix', async () => {
    const base = await mountBase('spool-isolation')
    try {
      const { domain, spool } = await open(base, 100)
      await spool.push('otlp', [record(1, 'otlp')])
      await spool.push('langfuse', [record(2, 'lf')])
      expect(spool.peek('otlp', 10).records).toHaveLength(1)
      expect(spool.peek('langfuse', 10).records).toHaveLength(1)
      expect(spool.counts().otlp.records).toBe(1)
      expect(spool.counts().langfuse.records).toBe(1)
      await domain.close()
    } finally {
      await unmountBase(base)
    }
  })

  it('evicts the oldest batches when the record bound is exceeded', async () => {
    const base = await mountBase('spool-evict')
    try {
      const { domain, spool, dropped } = await open(base, 3)
      await spool.push('otlp', [record(1, 'a'), record(2, 'b')])
      await spool.push('otlp', [record(3, 'c'), record(4, 'd')])
      // First batch (2 records) evicted for the second batch; 2 dropped.
      expect(spool.counts().otlp.records).toBe(2)
      expect(dropped).toEqual([2])
      const remaining = spool.peek('otlp', 10)
      expect(remaining.records.map(item => item.kind === 'span' ? item.span.turn : 0)).toEqual([3, 4])
      await domain.close()
    } finally {
      await unmountBase(base)
    }
  })

  it('keeps only the newest records when one batch alone exceeds the bound', async () => {
    const base = await mountBase('spool-oversize-batch')
    try {
      const { domain, spool, dropped } = await open(base, 2)
      await spool.push('otlp', [record(1, 'a'), record(2, 'b'), record(3, 'c')])
      expect(spool.counts().otlp.records).toBe(2)
      expect(dropped).toEqual([1])
      await domain.close()
    } finally {
      await unmountBase(base)
    }
  })

  it('rejects hostile stored records at the durable boundary and reports them', async () => {
    const base = await mountBase('spool-invalid')
    try {
      const { domain, spool, invalid } = await open(base, 100)
      await spool.push('otlp', [record(1, 'a')])
      // Hand-edit the table with a record that fails ExportRecord validation.
      await domain.table('spool').put('otlp:0000000000000099', { createdAt: 5, records: ['not-a-record'] })
      const peeked = spool.peek('otlp', 10)
      expect(peeked.records).toHaveLength(1)
      expect(invalid).toEqual([1])
      await domain.close()
    } finally {
      await unmountBase(base)
    }
  })

  it('resumes the batch sequence across a reopen', async () => {
    const base = await mountBase('spool-resume')
    try {
      const first = await open(base, 100)
      await first.spool.push('otlp', [record(1, 'a')])
      await first.domain.close()

      const second = await open(base, 100)
      await second.spool.push('otlp', [record(2, 'b')])
      const keys = second.spool.peek('otlp', 10).batches.map(batch => batch.key).sort()
      expect(keys).toHaveLength(2)
      expect(keys[0]).not.toBe(keys[1])
      // The second key must sequence after the first (no reuse).
      expect(Number(keys[1]!.split(':')[1])).toBeGreaterThan(Number(keys[0]!.split(':')[1]))
      await second.domain.close()
    } finally {
      await unmountBase(base)
    }
  })
})

describe('spool of empty batches', () => {
  it('ignores empty pushes', async () => {
    const base = await mountBase('spool-empty')
    try {
      const { domain, spool } = await open(base, 100)
      await spool.push('otlp', [])
      expect(spool.counts().otlp.batches).toBe(0)
      await domain.close()
    } finally {
      await unmountBase(base)
    }
  })
})
