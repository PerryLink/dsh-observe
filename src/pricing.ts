/**
 * Cost pricing: match a model's token usage against the configured pricing
 * table and compute the call cost. No prices are hardcoded — an empty table
 * simply means the cost metric stays silent for that model.
 * @module dsh-observe/pricing
 */

import type { PricingRule } from './config.ts'
import type { TokenCounts } from './model.ts'

/**
 * Compile a glob pattern (only `*` is special) to an anchored regular
 * expression.
 * @param pattern - the glob pattern over a model id.
 * @returns the compiled matcher.
 */
export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/gu, '\\$&').replaceAll('*', '.*')
  return new RegExp(`^${escaped}$`, 'u')
}

/**
 * Find the first pricing rule matching the attribution: `provider` matches
 * exactly when set, `model` matches as a glob.
 * @param pricing - the configured pricing table, in priority order.
 * @param provider - the provider route id.
 * @param model - the model id.
 * @returns the first matching rule, or undefined.
 */
export function findPrice(
  pricing: readonly PricingRule[],
  provider: string,
  model: string,
): PricingRule | undefined {
  return pricing.find(rule =>
    (rule.provider === undefined || rule.provider === provider)
    && globToRegExp(rule.model).test(model))
}

/**
 * Compute the USD cost of one call under a matched rule. Cache-read and
 * cache-write traffic falls back to the input price when the rule does not
 * price them separately.
 * @param rule - the matched pricing rule.
 * @param usage - the normalized token counts.
 * @returns the cost in USD.
 */
export function costUsd(rule: PricingRule, usage: TokenCounts): number {
  const cacheRead = usage.cacheRead * (rule.cacheReadPerToken ?? rule.inputPerToken)
  const cacheWrite = usage.cacheWrite * (rule.cacheWritePerToken ?? rule.inputPerToken)
  return usage.input * rule.inputPerToken
    + usage.output * rule.outputPerToken
    + cacheRead
    + cacheWrite
}
