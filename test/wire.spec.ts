/**
 * The Typert remote wire vocabulary: the strict schemas, the invocation
 * descriptors both faces register, the hand-written host manifest, and the
 * remote service's argument validation.
 * @module dsh-observe/test/wire.spec
 */

import { describe, expect, it } from 'vitest'
import { TYPERT } from '../src/typert.host.ts'
import { observeRemotePlugin } from '../src/remote.ts'
import {
  OBSERVE_SET_ENABLED_DESCRIPTOR,
  OBSERVE_SET_ENABLED_RESULT_SCHEMA,
  OBSERVE_STATUS_DESCRIPTOR,
  OBSERVE_STATUS_SCHEMA,
} from '../src/wire.ts'

function status() {
  return {
    enabled: true,
    backends: { otlp: true, langfuse: false },
    queueDepth: { otlp: 3, langfuse: 0 },
    spool: {
      otlp: { batches: 1, records: 4 },
      langfuse: { batches: 0, records: 0 },
    },
  }
}

describe('wire schemas', () => {
  it('accepts a full status snapshot', () => {
    expect(OBSERVE_STATUS_SCHEMA.parse(status())).toEqual(status())
  })

  it('rejects malformed snapshots', () => {
    expect(() => OBSERVE_STATUS_SCHEMA.parse({ enabled: 'yes' })).toThrow()
    expect(() => OBSERVE_STATUS_SCHEMA.parse({ ...status(), spool: { otlp: { batches: 'x' } } })).toThrow()
  })

  it('accepts the setEnabled result', () => {
    expect(OBSERVE_SET_ENABLED_RESULT_SCHEMA.parse({ enabled: false })).toEqual({ enabled: false })
    expect(() => OBSERVE_SET_ENABLED_RESULT_SCHEMA.parse({ enabled: 'false' })).toThrow()
  })
})

describe('invocation descriptors', () => {
  it('carries service, namespace, and method identity', () => {
    expect(OBSERVE_STATUS_DESCRIPTOR.id).toBe('dsh-observe#observe/status')
    expect(OBSERVE_STATUS_DESCRIPTOR.service).toBe('dsh-observe')
    expect(OBSERVE_STATUS_DESCRIPTOR.namespace).toBe('observe')
    expect(OBSERVE_STATUS_DESCRIPTOR.method).toBe('status')
    expect(OBSERVE_STATUS_DESCRIPTOR.parameters).toHaveLength(0)

    expect(OBSERVE_SET_ENABLED_DESCRIPTOR.method).toBe('setEnabled')
    expect(OBSERVE_SET_ENABLED_DESCRIPTOR.parameters).toHaveLength(1)
    expect(OBSERVE_SET_ENABLED_DESCRIPTOR.parameters[0]?.name).toBe('request')
  })

  it('validates the setEnabled argument through its codec', () => {
    const codec = OBSERVE_SET_ENABLED_DESCRIPTOR.parameters[0]?.codec.schema
    expect(codec?.parse({ enabled: true })).toEqual({ enabled: true })
    expect(() => codec?.parse({ enabled: 1 })).toThrow()
  })
})

describe('host typert manifest', () => {
  it('declares the package face and the invocation list', () => {
    expect(TYPERT.package).toBe('dsh-observe')
    expect(TYPERT.face).toBe('host')
    expect(TYPERT.invocations).toHaveLength(2)
    expect(TYPERT.model.services).toEqual([])
  })
})

describe('remote service', () => {
  it('round-trips the kill switch and rejects non-boolean requests', async () => {
    const { Context } = await import('@deepseek-ai/cordis')
    let enabled = true
    const ctx = new Context()
    const plugin = observeRemotePlugin({
      getStatus: () => ({
        enabled,
        backends: { otlp: true, langfuse: false },
        queueDepth: { otlp: 0, langfuse: 0 },
        spool: {
          otlp: { batches: 0, records: 0 },
          langfuse: { batches: 0, records: 0 },
        },
      }),
      setEnabled: value => {
        enabled = value
      },
    })
    await ctx.plugin(plugin)
    const service = ctx.get('observe') as unknown as {
      status(): { enabled: boolean }
      setEnabled(request: unknown): { enabled: boolean }
    }
    expect(service.status().enabled).toBe(true)
    expect(service.setEnabled({ enabled: false })).toEqual({ enabled: false })
    expect(service.status().enabled).toBe(false)
    expect(() => service.setEnabled({ enabled: 'false' })).toThrow(/requires \{ enabled: boolean \}/u)
    expect(() => service.setEnabled(undefined)).toThrow(/requires \{ enabled: boolean \}/u)
  })
})
