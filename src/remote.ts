/**
 * The optional Typert remote surface: a small `observe` service exposing
 * `observe/status` and `observe/setEnabled` to settings pages and other
 * remote consumers. `setEnabled` is the runtime kill switch — it stops
 * (or resumes) exporting without unmounting the plugin. Mounted only when
 * `remote.enabled: true`; the service itself never exports data.
 *
 * **No `@Remote` method decorators**: the rc.2 typert loader binds the
 * `./typert` manifest invocations (src/typert.host.ts) to same-named public
 * methods, and decorator syntax breaks both the vitest transform pipeline
 * and the plain-Node build output (the dsh-mcp-panel precedent).
 *
 * @module dsh-observe/remote
 */

import type { Context, Plugin } from '@deepseek-ai/cordis'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { ObserveStatus } from './wire.ts'

/** Bindings the remote service reads from the runtime. */
export interface ObserveRemoteOptions {
  getStatus: () => ObserveStatus
  setEnabled: (enabled: boolean) => void
}

/**
 * Build the `observe` Typert remote service as a Cordis plugin class.
 * @param options - the runtime bindings.
 * @returns the service plugin (mount with `ctx.plugin`).
 */
export function observeRemotePlugin(options: ObserveRemoteOptions): Plugin {
  class ObserveRemoteService extends TypertRemoteService {
    /**
     * @param ctx - the mounting context.
     */
    constructor(ctx: Context) {
      super(ctx, 'observe')
    }

    /** The read-only status snapshot (bound as `observe/status`). */
    status(): ObserveStatus {
      return options.getStatus()
    }

    /** The runtime kill switch (bound as `observe/setEnabled`). */
    setEnabled(request: { enabled: boolean }): { enabled: boolean } {
      const value: unknown = request?.enabled
      if (typeof value !== 'boolean') {
        throw new TypeError('observe.setEnabled requires { enabled: boolean }')
      }
      options.setEnabled(value)
      return { enabled: options.getStatus().enabled }
    }
  }
  return ObserveRemoteService as unknown as Plugin
}
