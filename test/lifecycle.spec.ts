/**
 * Lifecycle and export-contract suite: the HMR-safety test (dispose the
 * contributing fiber, prove the session/event + session/flush listeners no
 * longer export) and the default-export guard (module namespace + Loader
 * unwrap round-trip).
 * @module dsh-observe/test/lifecycle.spec
 */

import Loader from '@deepseek-ai/cordis-plugin-loader'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountBase, unmountBase } from './harness.ts'

async function loadPlugin(): Promise<typeof import('../src/index.ts')> {
  return await import('../src/index.ts')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// C2: the function-plugin namespace must survive Loader unwrapping
// ---------------------------------------------------------------------------

describe('export contract', () => {
  it('carries no default export and Loader unwrap round-trips the namespace', async () => {
    const plugin = await loadPlugin()
    expect('default' in plugin).toBe(false)
    const loader = Object.create(Loader.prototype) as { unwrapExports: (mod: unknown) => unknown }
    const unwrapped = loader.unwrapExports(plugin)
    expect(unwrapped).toBe(plugin)
    expect((unwrapped as { name: string }).name).toBe('observe')
    expect((unwrapped as { inject: string[] }).inject).toEqual(['storageDomain'])
    expect(typeof (unwrapped as { apply: unknown }).apply).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// C1: disposing the contributing fiber removes the session listeners
// ---------------------------------------------------------------------------

describe('fiber disposal', () => {
  it('stops exporting through session events once the plugin fiber is disposed', async () => {
    const base = await mountBase('lifecycle-dispose')
    try {
      const calls: Array<{ url: string }> = []
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        calls.push({ url })
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
      }))
      const plugin = await loadPlugin()
      const fiber = await base.ctx.plugin(plugin as never, {
        enabled: true,
        otlp: { endpoint: 'http://collector:4318' },
        batch: { flushIntervalMs: 60_000, bufferRetryIntervalMs: 60_000 },
      } as never)

      base.session.append('turn/start', { turn: 1 })
      base.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
      base.ctx.emit('session/flush', base.session)
      await vi.waitFor(() => expect(calls.length).toBeGreaterThan(0))

      await fiber.dispose()
      const callsAfterDispose = calls.length

      // The session/event and session/flush listeners are effect-scoped: after
      // dispose, appending and flushing must not reach the pipeline again.
      base.session.append('turn/start', { turn: 2 })
      base.session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
      base.ctx.emit('session/flush', base.session)
      await new Promise(resolve => setTimeout(resolve, 100))
      expect(calls.length).toBe(callsAfterDispose)
    } finally {
      await unmountBase(base)
    }
  })
})
