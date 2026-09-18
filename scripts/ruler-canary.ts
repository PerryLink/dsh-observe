// Ruler-liveness canary (alpha.2 line).
//
// This file must FAIL to compile against the current harness type line:
//   * `assistant/chunk` was removed from `SessionEventMap` (the collector now
//     reads it structurally), and
//   * a strict Typert codec carries `create()` instead of the legacy `schema`
//     field.
// A ruler that compiles this file is measuring a stale (alpha.1 / rc.2) face —
// the classic false green. scripts/assert-ruler-live.mjs expects the failure
// and inverts the exit code.
import type { SessionEventMap } from '@deepseek-ai/dsh-session'
import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol'

type LegacyChunkEvent = SessionEventMap['assistant/chunk']

const legacyCodec = { mode: 'strict' as const, typeSymbol: 'dsh-observe/canary', schema: null }

const legacyDescriptor = {
  id: 'dsh-observe#canary',
  service: 'dsh-observe',
  namespace: 'canary',
  method: 'canary',
  invocation: { kind: 'direct' as const },
  parameters: [{
    name: 'request',
    wire: 'request',
    source: 'json' as const,
    codec: legacyCodec,
  }],
  result: legacyCodec,
  sourceLocation: { file: 'scripts/ruler-canary.ts', line: 1, column: 1 },
} satisfies InvocationDescriptor

void legacyDescriptor
export type { LegacyChunkEvent }
