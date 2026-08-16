/**
 * Backoff delay computation for export retries: deterministic exponential
 * backoff (no jitter — tests and replays stay reproducible).
 * @module dsh-observe/backoff
 */

/**
 * Compute the delay before the next retry attempt.
 * @param consecutiveFailures - failures so far (1 = first retry).
 * @param policy - the resolved retry policy.
 * @returns the delay in milliseconds, capped at `maxDelayMs`.
 */
export function backoffDelayMs(
  consecutiveFailures: number,
  policy: { readonly baseDelayMs: number; readonly factor: number; readonly maxDelayMs: number },
): number {
  const exponent = Math.min(consecutiveFailures, 30)
  const delay = policy.baseDelayMs * (policy.factor ** exponent)
  return Math.min(delay, policy.maxDelayMs)
}
