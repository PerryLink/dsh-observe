/**
 * The pre-send sanitization layer: truncation budgets, key-name and pattern
 * redaction, structural JSON walks, and the JSON-text dual path. Every
 * function stays pure and deterministic; extreme inputs must never throw.
 * @module dsh-observe/test/sanitize.spec
 */

import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.ts'
import {
  REDACTED,
  isRedactedKey,
  redactText,
  sanitizeJson,
  sanitizeJsonText,
  sanitizeText,
  tokenizeKey,
  truncate,
} from '../src/sanitize.ts'
import type { ResolvedSanitize } from '../src/config.ts'

function policy(overrides: Partial<ResolvedSanitize> = {}): ResolvedSanitize {
  return {
    enabled: true,
    redactKeys: ['key', 'token', 'secret', 'password', 'authorization', 'credential', 'apikey'],
    redactPatterns: [],
    truncatePromptChars: 4_000,
    truncateCompletionChars: 4_000,
    truncateToolInputChars: 2_000,
    truncateToolOutputChars: 2_000,
    truncateAttributeChars: 512,
    ...overrides,
  }
}

describe('truncate', () => {
  it('leaves short text untouched', () => {
    expect(truncate('abc', 10)).toBe('abc')
  })

  it('appends the marker and respects the budget exactly', () => {
    expect(truncate('abcdef', 4)).toBe('abc…')
    expect(truncate('abcdef', 4)).toHaveLength(4)
  })

  it('zero budget yields the empty string; budget 1 yields just the marker', () => {
    expect(truncate('abcdef', 0)).toBe('')
    expect(truncate('abcdef', 1)).toBe('…')
  })
})

describe('tokenizeKey', () => {
  it('splits snake, kebab, and camelCase into words', () => {
    expect(tokenizeKey('api_key')).toEqual(['api', 'key'])
    expect(tokenizeKey('Authorization-Header')).toEqual(['authorization', 'header'])
    expect(tokenizeKey('apiKey')).toEqual(['api', 'key'])
    expect(tokenizeKey('')).toEqual([])
  })
})

describe('isRedactedKey', () => {
  it('matches structural words and substrings', () => {
    expect(isRedactedKey('apiKey', policy())).toBe(true)
    expect(isRedactedKey('x-token', policy())).toBe(true)
    expect(isRedactedKey('plain_title', policy())).toBe(false)
    expect(isRedactedKey('secret', policy({ enabled: false }))).toBe(false)
  })
})

describe('redactText', () => {
  it('replaces every pattern match and respects the disabled switch', () => {
    const secret = policy({ redactPatterns: [/\bsk-[A-Za-z0-9]{4,}\b/u] })
    expect(redactText('use sk-abc12345 here', secret)).toBe(`use ${REDACTED} here`)
    expect(redactText('use sk-abc12345 here', policy({ enabled: false }))).toBe('use sk-abc12345 here')
  })
})

describe('sanitizeJson', () => {
  it('redacts structural keys and does not walk their children', () => {
    const out = sanitizeJson({ user: { api_key: { nested: 'secret' }, name: 'x' } }, policy()) as { user: { api_key: string; name: string } }
    expect(out.user.api_key).toBe(REDACTED)
    expect(out.user.name).toBe('x')
  })

  it('scans string values with the configured patterns', () => {
    const secret = policy({ redactPatterns: [/ghp_[A-Za-z0-9]{4,}\b/u] })
    expect(sanitizeJson({ note: 'token ghp_abcdef' }, secret)).toEqual({ note: `token ${REDACTED}` })
  })

  it('normalizes exotic values to null instead of throwing', () => {
    expect(sanitizeJson({ fn: () => undefined }, policy())).toEqual({ fn: null })
    expect(sanitizeJson(undefined, policy())).toBeNull()
  })

  it('deep-clones arrays and nested objects', () => {
    const input = { list: [{ a: '1' }] }
    const out = sanitizeJson(input, policy()) as { list: Array<{ a: string }> }
    expect(out).toEqual(input)
    expect(out.list[0]).not.toBe(input.list[0])
  })
})

describe('sanitizeText', () => {
  it('redacts then truncates', () => {
    const secret = policy({ redactPatterns: [/secret-value/u] })
    expect(sanitizeText('xx secret-value yy', 8, secret)).toBe('xx [RED…')
  })
})

describe('sanitizeJsonText', () => {
  it('structurally redacts valid JSON and re-serializes', () => {
    expect(sanitizeJsonText('{"token":"abc"}', 200, policy())).toBe(`{"token":"${REDACTED}"}`)
  })

  it('falls back to text redaction for non-JSON input', () => {
    const secret = policy({ redactPatterns: [/sk-live/u] })
    expect(sanitizeJsonText('not json sk-live-123', 200, secret)).toBe(`not json ${REDACTED}-123`)
  })

  it('respects the budget on the re-serialized JSON', () => {
    const out = sanitizeJsonText('{"a":"very long value here"}', 10, policy())
    expect(out).toHaveLength(10)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('built-in secrets survive resolveConfig', () => {
  it('redacts GitHub tokens even with empty user patterns', () => {
    const resolved = resolveConfig({ sanitize: {} })
    const out = sanitizeText('leak ghp_AbCdEfGhIjKlMnOpQrStUvWx', 200, resolved.sanitize)
    expect(out).toBe(`leak ${REDACTED}`)
  })
})
