/**
 * Text projection of model-visible messages and content blocks. Used to
 * turn logged messages into the sanitized prompt/completion strings exported
 * to observability backends; every projection stays reconstructable from the
 * session log (the model-visible ⟺ logged invariant holds — no extra
 * information enters the export).
 * @module dsh-observe/project
 */

import type { ContentBlock, Message } from '@deepseek-ai/dsh-llm'

/**
 * The **retired** session-format-V3 tool-result wrapper.
 *
 * Through the V3 format a tool result was a content BLOCK nested inside a
 * message's content:
 * `{ type: 'tool-result', source: { callId }, content: [...] }`. Since the V4
 * format a tool result is a first-class `role: 'tool'` message instead
 * (`ToolResultMessage`: top-level `toolCallId` + `content` + optional
 * `isError`), `'tool-result'` is no longer a member of the host's
 * `ContentBlockMap`, and the host refuses the retired wrapper at **physical
 * row admission** — `assertV4ToolResultMessage` rejects any tool-role content
 * that still nests one (`packages/session/session-format-v3-to-v4/src/tool-role.ts`,
 * "content must not contain a released tool-result wrapper").
 *
 * This type exists ONLY so the read path below can still describe, and
 * therefore still project, a log written before the upgrade. It is deliberately
 * absent from `ContentBlock`, so no V4-shaped code can produce one by accident:
 * the sole way to obtain this shape is the {@link isRetiredToolResultWrapper}
 * guard. This module never constructs one.
 */
interface RetiredToolResultBlock {
  readonly type: 'tool-result'
  readonly content: readonly ContentBlock[]
}

/**
 * Read-only compatibility guard for the retired V3 tool-result wrapper.
 *
 * Structural, not a cast: a block that does not carry an array `content` is not
 * a wrapper, so a future or foreign block kind that happens to reuse the
 * `'tool-result'` tag cannot make the projection below recurse into nothing.
 *
 * This plugin is a pure consumer of tool results — it holds no path that
 * constructs a message or a content block — so there is no write-side
 * migration to perform here; keeping the read reachable is what lets a
 * pre-upgrade session log still project the output it already showed the model.
 * @param block - any block read off a logged message.
 * @returns whether the block is the retired V3 tool-result wrapper.
 */
export function isRetiredToolResultWrapper(block: unknown): block is RetiredToolResultBlock {
  return block !== null
    && typeof block === 'object'
    && (block as { type?: unknown }).type === 'tool-result'
    && Array.isArray((block as { content?: unknown }).content)
}

/**
 * Project content blocks to one compact plain-text string. Text and
 * reasoning deltas pass through verbatim; tool calls render as
 * `<tool-call name(arguments)>`; images render as `[image]`. Unknown block
 * types (merge-extensible) are skipped — they carry no projectable text.
 * @param blocks - the model-facing content blocks.
 * @returns the joined projection.
 */
export function projectContent(blocks: readonly ContentBlock[]): string {
  const parts: string[] = []
  for (const block of blocks as readonly unknown[]) {
    if (isRetiredToolResultWrapper(block)) {
      // Read-only compatibility for a log written before the V4 upgrade: the
      // retired wrapper's own `isError` flag is never persisted (the V3
      // migration rejects it, keeping only `content`), so the failure marker is
      // applied at MESSAGE level by `projectToolMessage` instead. A V3-era log
      // therefore loses that marker here — the honest reading of what the V3
      // row actually stored, not a silently invented `[error]`.
      parts.push(projectContent(block.content))
      continue
    }
    if (block === null || typeof block !== 'object') continue
    const typed = block as ContentBlock
    switch (typed.type) {
      case 'text':
        parts.push(typed.text)
        break
      case 'reasoning':
        parts.push(typed.text)
        break
      case 'tool-call':
        parts.push(`<tool-call ${typed.name}(${typed.arguments})>`)
        break
      case 'image':
        parts.push('[image]')
        break
      default:
        // Unknown content block types carry no projectable text. `file`,
        // `tool-addition`, and `tool-removal` land here: none of them holds
        // text the model ever saw.
        break
    }
  }
  return parts.join('\n')
}

/**
 * Narrow projection used by the completion export: keep only blocks of one
 * text-bearing kind (`text` or `reasoning`). The retired V3 wrapper is still
 * walked so a pre-upgrade log projects the same way it always did, but the
 * two kinds are never merged.
 * @param blocks - the model-facing content blocks.
 * @param kind - the block kind to keep.
 * @returns the joined text of that kind of block.
 */
function projectTextBlocks(blocks: readonly ContentBlock[], kind: 'text' | 'reasoning'): string {
  const parts: string[] = []
  for (const block of blocks as readonly unknown[]) {
    if (isRetiredToolResultWrapper(block)) {
      parts.push(projectTextBlocks(block.content, kind))
      continue
    }
    if (block === null || typeof block !== 'object') continue
    const typed = block as ContentBlock
    switch (typed.type) {
      case 'text':
      case 'reasoning':
        if (typed.type === kind) parts.push(typed.text)
        break
      default:
        break
    }
  }
  return parts.join('\n')
}

/**
 * Project the assistant's visible answer: `text` blocks only.
 *
 * This is the body of `gen_ai.completion`. `reasoning` blocks are deliberately
 * excluded — chain-of-thought is model-internal text that can quote the user's
 * input verbatim, and merging it into the completion makes it
 * indistinguishable from the final answer to a downstream backend (which would
 * then price and display CoT as completion output). Tool-call and image blocks
 * are not answer text either; tool calls are exported through their own tool
 * spans, never folded back into the completion.
 * @param blocks - the model-facing content blocks.
 * @returns the joined `text` blocks (possibly empty).
 */
export function projectTextContent(blocks: readonly ContentBlock[]): string {
  return projectTextBlocks(blocks, 'text')
}

/**
 * Project the reasoning (chain-of-thought) blocks, kept separate from the
 * completion. Exported only when both `llm.completion` and `llm.reasoning` are
 * enabled, and never mixed into `gen_ai.completion`.
 * @param blocks - the model-facing content blocks.
 * @returns the joined `reasoning` blocks (possibly empty).
 */
export function projectReasoningContent(blocks: readonly ContentBlock[]): string {
  return projectTextBlocks(blocks, 'reasoning')
}

/**
 * Project one message's content.
 *
 * A tool-role message carries its failure flag on the MESSAGE (`isError`), not
 * on any block, so it needs `projectToolMessage` to reproduce the `[error]`
 * marker the model saw. Every other role keeps the plain block projection.
 * @param message - the logged message.
 * @returns the projection of its content.
 */
export function projectMessageContent(message: Message): string {
  return message.role === 'tool'
    ? projectToolMessage(message)
    : projectContent(message.content)
}

/**
 * Project one first-class V4 tool-role message, surfacing its failure flag.
 *
 * V4 moved the tool result out of the content blocks and onto the message, so
 * the `[error]` marker has to be appended here — projecting the blocks alone
 * would drop it and report a failed tool as a successful one.
 * @param message - the logged tool-role message.
 * @returns the projected result text, marked when the invocation failed.
 */
export function projectToolMessage(message: {
  readonly content: readonly ContentBlock[]
  readonly isError?: boolean
}): string {
  return projectContent(message.content) + (message.isError === true ? ' [error]' : '')
}

/**
 * Project one message with its role prefix.
 * @param message - the logged message.
 * @returns `[role] content` on one logical line.
 */
export function projectMessage(message: Message): string {
  return `[${message.role}] ${projectMessageContent(message)}`
}
