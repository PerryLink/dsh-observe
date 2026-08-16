/**
 * The hand-written Typert HOST manifest for `dsh-observe`, exported as
 * `./typert` so the harness's typert-loader registers the `observe` status /
 * kill-switch invocations automatically when this plugin mounts. Same shape
 * as a generator output (validated by the loader): package face, empty model
 * and schemas, and the canonical invocation list from `src/wire.ts`.
 *
 * @module dsh-observe/typert
 */

import { OBSERVE_INVOCATIONS } from './wire.ts'

/** Host Typert manifest (validated by `@deepseek-ai/dsh-typert-loader`). */
export const TYPERT = Object.freeze({
  package: 'dsh-observe',
  face: 'host',
  schemas: Object.freeze([]),
  invocations: OBSERVE_INVOCATIONS,
  model: Object.freeze({
    services: Object.freeze([]),
    events: Object.freeze([]),
    objects: Object.freeze([]),
  }),
})
