/**
 * Pricing: glob compilation, first-match rule resolution, and USD cost
 * computation with the cache-price fallback. No prices are hardcoded in the
 * plugin — the table is configuration.
 * @module dsh-observe/test/pricing.spec
 */

import { describe, expect, it } from 'vitest'
import { costUsd, findPrice, globToRegExp } from '../src/pricing.ts'
import type { PricingRule } from '../src/config.ts'

describe('globToRegExp', () => {
  it('anchors and treats only * as a wildcard', () => {
    expect(globToRegExp('deepseek-chat').test('deepseek-chat')).toBe(true)
    expect(globToRegExp('deepseek-chat').test('deepseek-chat-extra')).toBe(false)
    expect(globToRegExp('deepseek-*').test('deepseek-chat')).toBe(true)
    expect(globToRegExp('*').test('anything')).toBe(true)
  })

  it('escapes regex metacharacters', () => {
    expect(globToRegExp('a.b+c').test('a.b+c')).toBe(true)
    expect(globToRegExp('a.b+c').test('axbxc')).toBe(false)
  })
})

describe('findPrice', () => {
  const rules: PricingRule[] = [
    { provider: 'deepseek', model: 'deepseek-*', inputPerToken: 1, outputPerToken: 2 },
    { model: '*', inputPerToken: 10, outputPerToken: 20 },
  ]

  it('returns the first matching rule in list order', () => {
    expect(findPrice(rules, 'deepseek', 'deepseek-chat')?.inputPerToken).toBe(1)
    expect(findPrice(rules, 'other', 'some-model')?.inputPerToken).toBe(10)
  })

  it('matches the provider exactly when set', () => {
    expect(findPrice(rules, 'not-deepseek', 'deepseek-chat')?.inputPerToken).toBe(10)
  })

  it('returns undefined when nothing matches', () => {
    expect(findPrice([], 'deepseek', 'deepseek-chat')).toBeUndefined()
  })
})

describe('costUsd', () => {
  it('prices cache traffic at the input price when the rule does not price caches', () => {
    const rule: PricingRule = { model: '*', inputPerToken: 0.5, outputPerToken: 1.5 }
    const usage = { input: 10, output: 10, cacheRead: 4, cacheWrite: 2, reasoning: 3 }
    // 10*0.5 + 10*1.5 + (4+2)*0.5 = 5 + 15 + 3 = 23
    expect(costUsd(rule, usage)).toBe(23)
  })

  it('prices cache traffic separately when the rule declares it', () => {
    const rule: PricingRule = { model: '*', inputPerToken: 0.5, outputPerToken: 1.5, cacheReadPerToken: 0.1, cacheWritePerToken: 0.2 }
    const usage = { input: 10, output: 10, cacheRead: 4, cacheWrite: 2, reasoning: 3 }
    // 10*0.5 + 10*1.5 + 4*0.1 + 2*0.2 = 5 + 15 + 0.4 + 0.4 = 20.8
    expect(costUsd(rule, usage)).toBeCloseTo(20.8, 10)
  })

  it('reasoning tokens are not priced separately (input price covers them)', () => {
    const rule: PricingRule = { model: '*', inputPerToken: 0.5, outputPerToken: 1.5 }
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 100 }
    expect(costUsd(rule, usage)).toBe(0)
  })
})
