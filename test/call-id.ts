/**
 * Dual-ruler call-id brand: the host master renamed the dsh-llm `CallId`
 * brand to `ToolCallId` (`packages/llm/llm/src/brand.ts`), while the
 * published 0.1.1-rc.2 line still exports `CallId`. Derive the brand from
 * the dsh-session `tool/call` event payload — the seam this suite already
 * types against — so tests stay green on both rulers without naming either
 * brand.
 * @module dsh-observe/test/call-id
 */

import type { SessionEventMap } from '@deepseek-ai/dsh-session'

/** The tool-call id brand as declared by the session event vocabulary. */
export type CallId = SessionEventMap['tool/call']['callId']

/** Brand a string as the session-vocabulary call id. */
export const CallId = ((id: string) => id) as unknown as (id: string) => SessionEventMap['tool/call']['callId']
