/**
 * The `observe` Remote wire vocabulary: the status snapshot and the kill
 * switch result, their zod v4 strict schemas, and the invocation descriptors
 * shared by the host `./typert` manifest. One canonical source keeps the two
 * Typert faces from drifting apart.
 * @module dsh-observe/wire
 */

import { z } from 'zod'
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'
import type { SpoolCounts } from './spool.ts'

/** The status payload returned by `observe/status`. */
export interface ObserveStatus {
  /** The runtime kill switch state. */
  enabled: boolean
  /** Which backends are configured (not whether they are reachable). */
  backends: { otlp: boolean; langfuse: boolean }
  /** Queued + retry-pending records per backend. */
  queueDepth: { otlp: number; langfuse: number }
  /** Durable offline-buffer occupancy per backend. */
  spool: Record<'otlp' | 'langfuse', SpoolCounts>
}

/** Strict wire schema for {@link ObserveStatus} (zod v4). */
export const OBSERVE_STATUS_SCHEMA = z.object({
  enabled: z.boolean(),
  backends: z.object({ otlp: z.boolean(), langfuse: z.boolean() }),
  queueDepth: z.object({ otlp: z.number().int(), langfuse: z.number().int() }),
  spool: z.object({
    otlp: z.object({ batches: z.number().int(), records: z.number().int() }),
    langfuse: z.object({ batches: z.number().int(), records: z.number().int() }),
  }),
})

/** The result of `observe/setEnabled`: the kill switch state after the write. */
export interface ObserveSetEnabledResult {
  /** The runtime kill switch state after the change. */
  enabled: boolean
}

/** Strict wire schema for {@link ObserveSetEnabledResult} (zod v4). */
export const OBSERVE_SET_ENABLED_RESULT_SCHEMA = z.object({
  enabled: z.boolean(),
})

/** JSON codec for the setEnabled argument. */
const SET_ENABLED_ARGS_CODEC = z.object({
  enabled: z.boolean(),
})

/** The `observe/status` invocation descriptor: the read-only status snapshot. */
export const OBSERVE_STATUS_DESCRIPTOR = Object.freeze({
  id: 'dsh-observe#observe/status',
  service: 'dsh-observe',
  namespace: 'observe',
  method: 'status',
  invocation: Object.freeze({ kind: 'direct' }),
  parameters: Object.freeze([]),
  result: Object.freeze({
    mode: 'strict',
    typeSymbol: 'dsh-observe/types#ObserveStatus',
    schema: OBSERVE_STATUS_SCHEMA,
  }),
  sourceLocation: Object.freeze({ file: 'src/wire.ts', line: 1, column: 1 }),
} as const) satisfies InvocationDescriptor

/** The `observe/setEnabled` invocation descriptor: the runtime kill switch. */
export const OBSERVE_SET_ENABLED_DESCRIPTOR = Object.freeze({
  id: 'dsh-observe#observe/setEnabled',
  service: 'dsh-observe',
  namespace: 'observe',
  method: 'setEnabled',
  invocation: Object.freeze({ kind: 'direct' }),
  parameters: Object.freeze([Object.freeze({
    name: 'request',
    wire: 'request',
    source: 'json',
    codec: Object.freeze({
      mode: 'strict',
      typeSymbol: 'dsh-observe/types#ObserveSetEnabledArgs',
      schema: SET_ENABLED_ARGS_CODEC,
    }),
  } satisfies InvocationDescriptor['parameters'][number])]),
  result: Object.freeze({
    mode: 'strict',
    typeSymbol: 'dsh-observe/types#ObserveSetEnabledResult',
    schema: OBSERVE_SET_ENABLED_RESULT_SCHEMA,
  }),
  sourceLocation: Object.freeze({ file: 'src/wire.ts', line: 1, column: 1 }),
} as const) satisfies InvocationDescriptor

/** The canonical invocation list both Typert faces register. */
export const OBSERVE_INVOCATIONS = Object.freeze([
  OBSERVE_STATUS_DESCRIPTOR,
  OBSERVE_SET_ENABLED_DESCRIPTOR,
])
