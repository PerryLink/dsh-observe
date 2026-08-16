/**
 * Deterministic span and trace ids. Ids are SHA-256 digests of the session
 * identity plus structural keys, truncated to the widths each backend
 * requires (OTel: 16-byte trace ids / 8-byte span ids; Langfuse: 32-hex
 * observation and trace ids). Determinism is a feature: replaying the same
 * session log produces the same ids, so backends deduplicate re-exports
 * instead of double-counting.
 * @module dsh-observe/ids
 */

import { createHash } from 'node:crypto'

/**
 * Digest joined structural parts to a fixed hex string.
 * @param parts - the structural identity parts.
 * @param bytes - digest length in bytes.
 * @returns lowercase hex, `bytes * 2` characters.
 */
export function digest(parts: readonly (string | number)[], bytes: number): string {
  const hash = createHash('sha256')
  for (const part of parts) {
    hash.update('|')
    // The runtime type rides the digest: structural parts `1` (number) and
    // `'1'` (string) must never collide into one id.
    hash.update(typeof part)
    hash.update('=')
    hash.update(String(part))
  }
  return hash.digest('hex').slice(0, bytes * 2)
}

/**
 * OTel trace id for one session turn (16 bytes, 32 hex chars).
 * @param sessionId - the session identity.
 * @param turn - the turn number.
 * @returns the trace id.
 */
export function otelTraceId(sessionId: string, turn: number): string {
  return digest(['trace', sessionId, turn], 16)
}

/**
 * OTel span id for one span (8 bytes, 16 hex chars).
 * @param parts - the span's structural identity.
 * @returns the span id.
 */
export function otelSpanId(...parts: readonly (string | number)[]): string {
  return digest(['span', ...parts], 8)
}

/**
 * Langfuse trace id for one session turn (32 hex chars).
 * @param sessionId - the session identity.
 * @param turn - the turn number.
 * @returns the trace id.
 */
export function langfuseTraceId(sessionId: string, turn: number): string {
  return digest(['langfuse-trace', sessionId, turn], 16)
}

/**
 * Langfuse observation or event id (32 hex chars).
 * @param parts - the observation's structural identity.
 * @returns the id.
 */
export function langfuseId(...parts: readonly (string | number)[]): string {
  return digest(['langfuse', ...parts], 16)
}
