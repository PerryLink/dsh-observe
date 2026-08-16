/**
 * The pre-send sanitization layer. Every string or JSON value that could
 * reach an observability backend passes through these pure functions before
 * it is queued, batched, or spooled: key-name redaction and pattern
 * redaction remove secrets and credentials, and per-surface character
 * budgets truncate bodies. Sanitization is pure and deterministic so a
 * replayed session log produces byte-identical exports.
 * @module dsh-observe/sanitize
 */

import type { ResolvedSanitize } from './config.ts'

/** The placeholder replacing any redacted value. */
export const REDACTED = '[REDACTED]'

/**
 * Truncate text to a character budget, appending an ellipsis marker when
 * content is cut. A budget of zero yields the empty string.
 * @param text - the text to bound.
 * @param budget - maximum character count (marker included).
 * @returns the bounded text.
 */
export function truncate(text: string, budget: number): string {
  if (text.length <= budget) return text
  if (budget <= 0) return ''
  if (budget === 1) return '…'
  return `${text.slice(0, budget - 1)}…`
}

/**
 * Apply pattern redaction to one text value: every match of every
 * configured pattern (built-in secret patterns plus the user patterns) is
 * replaced with {@link REDACTED}.
 * @param text - the text to scan.
 * @param policy - the resolved sanitization policy.
 * @returns the redacted text.
 */
export function redactText(text: string, policy: ResolvedSanitize): string {
  if (!policy.enabled) return text
  let out = text
  for (const pattern of policy.redactPatterns) {
    out = out.replace(pattern, REDACTED)
  }
  return out
}

/**
 * Split a key name into its words (snake_case, kebab-case, and camelCase
 * boundaries) for structural key redaction.
 * @param key - the raw key name.
 * @returns lowercase word tokens.
 */
export function tokenizeKey(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .split(/[^a-zA-Z0-9]+/u)
    .map(token => token.toLowerCase())
    .filter(token => token.length > 0)
}

/**
 * Whether a structural key name is redacted under the policy: any word
 * token matches one of the redaction key names.
 * @param key - the raw key name.
 * @param policy - the resolved sanitization policy.
 * @returns true when the key's value must be replaced.
 */
export function isRedactedKey(key: string, policy: ResolvedSanitize): boolean {
  if (!policy.enabled) return false
  const tokens = tokenizeKey(key)
  const lowerKey = key.toLowerCase()
  return tokens.some(token => policy.redactKeys.some(name => token === name || lowerKey.includes(name)))
}

/**
 * Deep-clone an arbitrary JSON value while redacting: object keys matching
 * the policy are replaced with {@link REDACTED} (their children are not
 * walked), and every string value is pattern-scanned. Non-JSON exotic
 * values (functions, symbols, class instances) normalize to `null` — the
 * session log guarantees JSON inputs, so that branch exists only as
 * containment for data crossing an untrusted boundary.
 * @param value - the value to sanitize.
 * @param policy - the resolved sanitization policy.
 * @returns a JSON-safe sanitized clone.
 */
export function sanitizeJson(value: unknown, policy: ResolvedSanitize): unknown {
  if (typeof value === 'string') return redactText(value, policy)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) return value.map(item => sanitizeJson(item, policy))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      out[key] = isRedactedKey(key, policy) ? REDACTED : sanitizeJson(child, policy)
    }
    return out
  }
  return null
}

/**
 * Sanitize and bound one text body: pattern redaction first, then the
 * character budget.
 * @param text - the text to sanitize.
 * @param budget - character budget.
 * @param policy - the resolved sanitization policy.
 * @returns the sanitized, bounded text.
 */
export function sanitizeText(text: string, budget: number, policy: ResolvedSanitize): string {
  return truncate(redactText(text, policy), budget)
}

/**
 * Sanitize a value that is either JSON text (parsed for structural key
 * redaction, then re-serialized) or free-form text: a valid JSON parse gets
 * the structural walk, anything else is pattern-scanned as text. Both paths
 * end inside the character budget.
 * @param value - the raw value (typically a tool arguments string).
 * @param budget - character budget.
 * @param policy - the resolved sanitization policy.
 * @returns the sanitized value: re-serialized JSON when the input parsed,
 *   plain text otherwise.
 */
export function sanitizeJsonText(value: string, budget: number, policy: ResolvedSanitize): string {
  try {
    const parsed: unknown = JSON.parse(value)
    const cleaned = sanitizeJson(parsed, policy)
    return truncate(JSON.stringify(cleaned), budget)
  } catch {
    // Not JSON: fall through to plain-text redaction.
    return sanitizeText(value, budget, policy)
  }
}
