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
 * Project content blocks to one compact plain-text string. Text and
 * reasoning deltas pass through verbatim; tool calls render as
 * `<tool-call name(arguments)>`; images render as `[image]`; tool results
 * recurse. Unknown block types (merge-extensible) are skipped — they carry
 * no projectable text.
 * @param blocks - the model-facing content blocks.
 * @returns the joined projection.
 */
export function projectContent(blocks: readonly ContentBlock[]): string {
  const parts: string[] = []
  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        parts.push(block.text)
        break
      case 'reasoning':
        parts.push(block.text)
        break
      case 'tool-call':
        parts.push(`<tool-call ${block.name}(${block.arguments})>`)
        break
      case 'image':
        parts.push('[image]')
        break
      case 'tool-result':
        parts.push(projectContent(block.content) + (block.isError === true ? ' [error]' : ''))
        break
      default:
        // Unknown content block types carry no projectable text.
        break
    }
  }
  return parts.join('\n')
}

/**
 * Project one message with its role prefix.
 * @param message - the logged message.
 * @returns `[role] content` on one logical line.
 */
export function projectMessage(message: Message): string {
  return `[${message.role}] ${projectContent(message.content)}`
}
