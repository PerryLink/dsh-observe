/**
 * Deterministic id digests: same session + structure always yields the same
 * id (backends deduplicate re-exports), different structure never collides
 * across the tested space, and every id respects its backend width.
 * @module dsh-observe/test/ids.spec
 */

import { describe, expect, it } from 'vitest'
import { digest, langfuseId, langfuseTraceId, otelSpanId, otelTraceId } from '../src/ids.ts'

describe('digest', () => {
  it('is deterministic and hex', () => {
    const first = digest(['a', 1], 8)
    const second = digest(['a', 1], 8)
    expect(first).toBe(second)
    expect(first).toMatch(/^[0-9a-f]{16}$/u)
  })

  it('separates different structural parts', () => {
    expect(digest(['a', 1], 8)).not.toBe(digest(['a', 2], 8))
    expect(digest(['a', 1], 8)).not.toBe(digest(['b', 1], 8))
    expect(digest(['a', 1], 8)).not.toBe(digest(['a', '1'], 8))
  })
})

describe('backend id widths', () => {
  it('OTel trace ids are 32 hex chars (16 bytes)', () => {
    expect(otelTraceId('s1', 3)).toMatch(/^[0-9a-f]{32}$/u)
  })

  it('OTel span ids are 16 hex chars (8 bytes)', () => {
    expect(otelSpanId('s1', 3, 1, 'tool')).toMatch(/^[0-9a-f]{16}$/u)
  })

  it('Langfuse ids are 32 hex chars (16 bytes)', () => {
    expect(langfuseTraceId('s1', 3)).toMatch(/^[0-9a-f]{32}$/u)
    expect(langfuseId('span-event', 'x')).toMatch(/^[0-9a-f]{32}$/u)
  })

  it('same turn yields one trace id but distinct span ids per structural key', () => {
    const turn = 7
    const traceA = otelTraceId('s1', turn)
    const traceB = otelTraceId('s1', turn)
    expect(traceA).toBe(traceB)
    const stepSpan = otelSpanId('s1', turn, 1, 'step')
    const toolSpan = otelSpanId('s1', turn, 1, 'c1')
    expect(stepSpan).not.toBe(toolSpan)
  })
})
