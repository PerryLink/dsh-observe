/**
 * The plugin assembly over the REAL host seams (SessionStore, storage
 * domain, json backend) with a scripted network edge: off-by-default
 * mounting, span export through the pipeline on session/flush, the Typert
 * remote kill switch, and teardown through the fiber disposer.
 * @module dsh-observe/test/index.spec
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountBase, unmountBase } from './harness.ts'

/** Install a recording fetch stub (the plugin's only network edge). */
function installFetch() {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Mount the plugin on the harness context. */
async function mountPlugin(base: Awaited<ReturnType<typeof mountBase>>, config: Record<string, unknown>) {
  const plugin = await import('../src/index.ts')
  const fiber = await base.ctx.plugin(plugin as never, config as never)
  return fiber
}

describe('apply with enabled: false', () => {
  it('stays inert and never opens the durable domain', async () => {
    const base = await mountBase('index-disabled')
    try {
      const fetchMock = installFetch()
      const fiber = await mountPlugin(base, {})
      base.session.append('turn/start', { turn: 1 })
      base.ctx.emit('session/flush', base.session)
      expect(fetchMock.calls).toHaveLength(0)
      await fiber.dispose()
    } finally {
      await unmountBase(base)
    }
  })
})

describe('apply with an otlp backend', () => {
  it('exports the turn span through the pipeline on session/flush', async () => {
    const base = await mountBase('index-export')
    try {
      const fetchMock = installFetch()
      const fiber = await mountPlugin(base, {
        enabled: true,
        otlp: { endpoint: 'http://collector:4318' },
        batch: { flushIntervalMs: 60_000, bufferRetryIntervalMs: 60_000 },
      })
      base.session.append('turn/start', { turn: 1 })
      base.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
      base.ctx.emit('session/flush', base.session)
      await vi.waitFor(() => expect(fetchMock.calls.length).toBeGreaterThan(0))
      const body = JSON.parse(String(fetchMock.calls[0]?.init.body)) as {
        resourceSpans: Array<{ scopeSpans: Array<{ spans: Array<{ name: string }> }> }>
      }
      const names = body.resourceSpans[0]?.scopeSpans[0]?.spans.map(spanItem => spanItem.name) ?? []
      expect(names).toContain('turn 1')
      await fiber.dispose()
    } finally {
      await unmountBase(base)
    }
  })

  it('exposes the Typert remote kill switch and stops exporting when disabled', async () => {
    const base = await mountBase('index-remote')
    try {
      const fetchMock = installFetch()
      const fiber = await mountPlugin(base, {
        enabled: true,
        otlp: { endpoint: 'http://collector:4318' },
        remote: { enabled: true },
        batch: { flushIntervalMs: 60_000, bufferRetryIntervalMs: 60_000 },
      })
      const remote = base.ctx.get('observe') as unknown as {
        status(): { enabled: boolean; backends: { otlp: boolean; langfuse: boolean } }
        setEnabled(request: { enabled: boolean }): { enabled: boolean }
      }
      expect(remote.status().backends.otlp).toBe(true)
      expect(remote.status().enabled).toBe(true)

      base.session.append('turn/start', { turn: 2 })
      base.session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
      base.ctx.emit('session/flush', base.session)
      await vi.waitFor(() => expect(fetchMock.calls.length).toBeGreaterThan(0))
      const callsBefore = fetchMock.calls.length

      remote.setEnabled({ enabled: false })
      expect(remote.status().enabled).toBe(false)
      base.session.append('turn/start', { turn: 3 })
      base.session.append('turn/end', { turn: 3, reason: { kind: 'completed' } })
      base.ctx.emit('session/flush', base.session)
      await new Promise(resolve => setTimeout(resolve, 100))
      expect(fetchMock.calls.length).toBe(callsBefore)

      remote.setEnabled({ enabled: true })
      expect(remote.status().enabled).toBe(true)
      await fiber.dispose()
    } finally {
      await unmountBase(base)
    }
  })

  it('fails loud when enabled without any backend', async () => {
    const base = await mountBase('index-no-backend')
    try {
      await expect(mountPlugin(base, { enabled: true })).rejects.toThrow(/at least one backend/u)
    } finally {
      await unmountBase(base)
    }
  })
})

describe('the optional inspector outlet', () => {
  it('publishes metrics when the experimental inspector service is composed', async () => {
    const base = await mountBase('index-inspector')
    try {
      const published: Array<{ topic: string; payload: unknown }> = []
      base.ctx.provide('inspector', {
        publish: (topic: string, payload: unknown) => { published.push({ topic, payload }) },
      } as never)
      // A failing sink is the shortest path to a real operational metric
      // (`observe.export_failures`), so the outlet is exercised end to end.
      const fetchMock = vi.fn(async () => new Response('boom', { status: 500 }))
      vi.stubGlobal('fetch', fetchMock)
      const fiber = await mountPlugin(base, {
        enabled: true,
        otlp: { endpoint: 'http://collector:4318' },
        batch: { flushIntervalMs: 60_000, bufferRetryIntervalMs: 60_000 },
      })
      base.session.append('turn/start', { turn: 3 })
      base.session.append('turn/end', { turn: 3, reason: { kind: 'completed' } })
      base.ctx.emit('session/flush', base.session)

      await vi.waitFor(() => expect(published.length).toBeGreaterThan(0))
      expect(published.every(entry => entry.topic === 'observe.metric')).toBe(true)
      const first = published[0]?.payload as { name?: string } | undefined
      expect(first?.name).toBe('observe.export_failures')
      await fiber.dispose()
    } finally {
      await unmountBase(base)
    }
  })

  it('keeps exporting when the inspector service throws', async () => {
    const base = await mountBase('index-inspector-throwing')
    try {
      base.ctx.provide('inspector', {
        publish: () => { throw new Error('inspector worker gone') },
      } as never)
      const fetchMock = installFetch()
      const fiber = await mountPlugin(base, {
        enabled: true,
        otlp: { endpoint: 'http://collector:4318' },
        batch: { flushIntervalMs: 60_000, bufferRetryIntervalMs: 60_000 },
      })
      base.session.append('turn/start', { turn: 4 })
      base.session.append('turn/end', { turn: 4, reason: { kind: 'completed' } })
      base.ctx.emit('session/flush', base.session)
      await vi.waitFor(() => expect(fetchMock.calls.length).toBeGreaterThan(0))
      await fiber.dispose()
    } finally {
      await unmountBase(base)
    }
  })
})

describe('apply with an unavailable durable buffer', () => {
  it('still mounts, warns once, and keeps exporting through memory (A02)', async () => {
    // The old shape awaited the domain open bare, so a rejection failed the
    // whole mount. The production cause is storageDomain's single-open-per-name
    // rule: a hot reload that races the previous instance's close leaves the
    // name reserved and the second open rejects. Reproduce it exactly by
    // holding the domain open across the plugin mount.
    const base = await mountBase('index-degraded')
    try {
      const warnings: string[] = []
      base.ctx.logger.exporter({
        // The exporter needs an explicit level for the plugin's logger name;
        // the service's own ring buffer drops warnings at its default level.
        levels: { observe: 3 },
        export: (message) => {
          warnings.push(`${message.type}:${message.args.map(String).join(' ')}`)
        },
      })
      const { observeDomainSpec } = await import('../src/spool.ts')
      const held = await base.ctx.storageDomain.open(observeDomainSpec)
      const fetchMock = installFetch()

      const fiber = await mountPlugin(base, {
        enabled: true,
        otlp: { endpoint: 'http://collector:4318' },
        batch: { flushIntervalMs: 60_000, bufferRetryIntervalMs: 60_000 },
      })

      const degradation = warnings.filter(line => line.includes('offline buffer unavailable'))
      expect(degradation, `warnings: ${JSON.stringify(warnings)}`).toHaveLength(1)
      expect(degradation[0]).toMatch(/already open/u)

      base.session.append('turn/start', { turn: 7 })
      base.session.append('turn/end', { turn: 7, reason: { kind: 'completed' } })
      base.ctx.emit('session/flush', base.session)
      await vi.waitFor(() => expect(fetchMock.calls.length).toBeGreaterThan(0))

      await fiber.dispose()
      await held.close()
    } finally {
      await unmountBase(base)
    }
  })
})
