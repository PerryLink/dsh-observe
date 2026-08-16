/**
 * Config contract: the Schemastery schema validates and fills defaults, the
 * union-with-null backends accept null and absent input alike, and
 * `resolveConfig` fails loud on invalid endpoints, credentials, patterns,
 * pricing, and bounds — never silently half-enables a backend.
 * @module dsh-observe/test/config.spec
 */

import { describe, expect, it } from 'vitest'
import { Config, resolveConfig } from '../src/config.ts'

describe('Config schema', () => {
  it('applies every default on an empty input', () => {
    const resolved = Config({})
    expect(resolved.enabled).toBe(false)
    // Absent backends stay absent (the union keeps `undefined`); an explicit
    // `null` also disables them — resolveConfig treats both as off.
    expect(resolved.otlp).toBeUndefined()
    expect(resolved.langfuse).toBeUndefined()
    expect(resolved.capture).toEqual({ turns: true, steps: true, tools: true, llm: true })
    expect(resolved.llm).toEqual({ prompt: true, completion: true })
    expect(resolved.metadata).toEqual({ sessionId: true, cwd: false, agentPreset: true, model: true })
    expect(resolved.metrics).toEqual({ tokens: true, cost: true, contextTokens: true })
    expect(resolved.pricing).toEqual([])
    expect(resolved.sanitize?.enabled).toBe(true)
    expect(resolved.sanitize?.truncatePromptChars).toBe(4_000)
    expect(resolved.batch?.maxRecords).toBe(256)
    expect(resolved.retry?.maxAttempts).toBe(5)
    expect(resolved.remote?.enabled).toBe(false)
  })

  it('accepts an explicit null backend and fills the sub-defaults of a configured one', () => {
    const resolved = Config({
      otlp: null,
      langfuse: { publicKey: 'pk', secretKey: 'sk' },
    })
    expect(resolved.otlp).toBeNull()
    expect(resolved.langfuse).not.toBeNull()
    expect(resolved.langfuse?.baseUrl).toBe('https://cloud.langfuse.com')
    expect(resolved.langfuse?.timeoutMs).toBe(10_000)
  })

  it('fills otlp defaults when the backend is configured', () => {
    const resolved = Config({ otlp: { endpoint: 'http://localhost:4318' } })
    expect(resolved.otlp?.serviceName).toBe('deepseek-harness')
    expect(resolved.otlp?.headers).toEqual({})
  })

  it('rejects backends missing required credentials', () => {
    expect(() => Config({ langfuse: { publicKey: 'pk' } } as never)).toThrow()
    expect(() => Config({ otlp: {} } as never)).toThrow()
  })
})

describe('resolveConfig', () => {
  it('fails loud when enabled without any backend', () => {
    expect(() => resolveConfig({ enabled: true })).toThrow(/at least one backend/u)
  })

  it('resolves otlp to undefined when explicitly null, and fills its defaults', () => {
    const resolved = resolveConfig({ enabled: true, otlp: { endpoint: 'http://collector:4318/' }, langfuse: null })
    expect(resolved.otlp?.endpoint).toBe('http://collector:4318')
    expect(resolved.otlp?.serviceName).toBe('deepseek-harness')
    expect(resolved.langfuse).toBeUndefined()
  })

  it('rejects a non-http(s) or malformed endpoint', () => {
    expect(() => resolveConfig({ otlp: { endpoint: 'ftp://x' } })).toThrow(/http\(s\)/u)
    expect(() => resolveConfig({ otlp: { endpoint: 'not a url' } })).toThrow(/valid URL/u)
  })

  it('rejects the API sub-path on the OTLP endpoint (the sink appends /v1/*)', () => {
    expect(() => resolveConfig({ otlp: { endpoint: 'http://x/v1/traces' } })).toThrow(/base URL/u)
  })

  it('rejects an empty serviceName and fills it from the default otherwise', () => {
    expect(() => resolveConfig({ otlp: { endpoint: 'http://x', serviceName: '  ' } })).toThrow(/serviceName/u)
    expect(resolveConfig({ otlp: { endpoint: 'http://x' } }).otlp?.serviceName).toBe('deepseek-harness')
  })

  it('compiles redaction patterns and fails loud on invalid regexes', () => {
    const resolved = resolveConfig({ sanitize: { redactPatterns: ['\\bsk-[a-z]+\\b'] } })
    expect(resolved.sanitize.redactPatterns.length).toBeGreaterThan(0)
    expect(() => resolveConfig({ sanitize: { redactPatterns: ['[unclosed'] } })).toThrow(/regular expression/u)
  })

  it('validates pricing rules in list order', () => {
    expect(() => resolveConfig({ pricing: [{ model: '', inputPerToken: 0, outputPerToken: 0 }] })).toThrow(/pricing\[0\]\.model/u)
    expect(() => resolveConfig({ pricing: [{ model: '*', inputPerToken: -1, outputPerToken: 0 }] })).toThrow(/inputPerToken/u)
    const resolved = resolveConfig({ pricing: [{ model: '*', inputPerToken: 0, outputPerToken: 1 }] })
    expect(resolved.pricing[0]?.model).toBe('*')
  })

  it('validates batch and retry bounds', () => {
    expect(() => resolveConfig({ batch: { maxRecords: 0 } })).toThrow(/batch.maxRecords/u)
    expect(() => resolveConfig({ retry: { maxAttempts: -1 } })).toThrow(/retry.maxAttempts/u)
    expect(() => resolveConfig({ retry: { factor: 0.5 } })).toThrow(/retry.factor/u)
  })

  it('defaults the kill switch to off (privacy default)', () => {
    expect(resolveConfig({}).enabled).toBe(false)
    expect(resolveConfig({}).remote).toBe(false)
  })
})
