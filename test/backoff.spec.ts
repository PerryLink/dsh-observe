/**
 * Backoff computation: deterministic exponential growth with the configured
 * factor, capped at the maximum delay. No jitter — replays stay reproducible.
 * @module dsh-observe/test/backoff.spec
 */

import { describe, expect, it } from 'vitest'
import { backoffDelayMs } from '../src/backoff.ts'

const policy = { baseDelayMs: 1_000, factor: 2, maxDelayMs: 60_000 }

describe('backoffDelayMs', () => {
  it('grows exponentially with each consecutive failure', () => {
    expect(backoffDelayMs(1, policy)).toBe(2_000)
    expect(backoffDelayMs(2, policy)).toBe(4_000)
    expect(backoffDelayMs(3, policy)).toBe(8_000)
  })

  it('caps at maxDelayMs', () => {
    expect(backoffDelayMs(20, policy)).toBe(60_000)
  })

  it('bounds the exponent so huge failure counts cannot overflow', () => {
    expect(backoffDelayMs(Number.MAX_SAFE_INTEGER, policy)).toBe(60_000)
  })

  it('honors a non-power factor', () => {
    const linear = { baseDelayMs: 100, factor: 3, maxDelayMs: 10_000 }
    expect(backoffDelayMs(1, linear)).toBe(300)
    expect(backoffDelayMs(2, linear)).toBe(900)
  })
})
