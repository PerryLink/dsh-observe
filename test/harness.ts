/**
 * Shared test harness: REAL Cordis `Context`, REAL `SessionStore`/`Session`
 * from the 0.1.1-rc.2 peers, and the REAL storage seam
 * (dsh-storage + dsh-storage-json backend + dsh-storage-domain facility)
 * rooted in a per-mount temp directory. Only the network edge (global
 * `fetch`) is scripted, per test.
 *
 * @module dsh-observe/test/harness
 */

import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Storage from '@deepseek-ai/dsh-storage'
import { apply as jsonApply, Config as jsonConfig } from '@deepseek-ai/dsh-storage-json'
import { apply as domainApply, Config as domainConfig } from '@deepseek-ai/dsh-storage-domain'
import SessionStore, { SessionId, type Session } from '@deepseek-ai/dsh-session'

/** Everything a mounted base hands back to a test. */
export interface BaseHarness {
  /** The mounting context (sessions + storage + domain facility). */
  readonly ctx: Context
  /** A real session created on the mounted store. */
  readonly session: Session
  /** The storage backend root (owned by the caller; delete on teardown). */
  readonly root: string
}

/**
 * Mount real session/store/domain services. The storage backend is the real
 * JSON backend rooted in a fresh temp directory; the caller removes it.
 * @param sessionId - session id to create (defaults to `observe-harness`).
 * @returns the mounted base.
 */
export async function mountBase(sessionId = 'observe-harness'): Promise<BaseHarness> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  const session = ctx.sessions.create(SessionId(sessionId))
  const root = await mkdtemp(path.join(tmpdir(), 'observe-test-'))
  await ctx.plugin(Storage)
  await ctx.plugin({ apply: jsonApply, Config: jsonConfig, inject: ['storage'] }, { root })
  await ctx.plugin({ apply: domainApply, Config: domainConfig, inject: ['storage'] }, { backend: 'json' })
  return { ctx, session, root }
}

/** Remove the temp root a base was mounted on (only own mkdtemp dirs). */
export async function unmountBase(base: BaseHarness): Promise<void> {
  const expected = path.join(tmpdir(), 'observe-test-')
  if (!base.root.startsWith(expected)) throw new Error(`refusing to remove non-harness dir: ${base.root}`)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await rm(base.root, { recursive: true, force: true })
      return
    } catch (error) {
      if (attempt === 2) throw error
      await sleep(50)
    }
  }
}

/** Fake timers settle: resolve after `ms`. */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
