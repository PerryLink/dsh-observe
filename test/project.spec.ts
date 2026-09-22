/**
 * Text projection of model-visible messages and content blocks — the strings
 * that become sanitized prompt/completion exports.
 * @module dsh-observe/test/project.spec
 */

import { describe, expect, it } from 'vitest'
import {
  isRetiredToolResultWrapper, projectContent, projectMessage, projectMessageContent, projectToolMessage,
} from '../src/project.ts'
import { CallId } from './call-id.ts'
import type { ContentBlock, Message } from '@deepseek-ai/dsh-llm'

/**
 * Build the **retired** session-format-V3 tool-result wrapper — a read-only
 * compatibility shape. Content written before the V4 upgrade nested
 * `{ type: 'tool-result', source: { callId }, content }` inside a message's
 * content array.
 *
 * The cast is the point: since V4 this block kind is absent from
 * `ContentBlockMap`, and the host rejects it at physical-row admission
 * (`assertV4ToolResultMessage`), so it is deliberately NOT a legal
 * `ContentBlock`. It exists here only to prove the read path still projects a
 * log written before the upgrade.
 * @param content - the nested result blocks the V3 row carried.
 * @returns the retired wrapper, typed as a legal block for the call site.
 */
function retiredV3Wrapper(content: ContentBlock[]): ContentBlock {
  return { type: 'tool-result', source: { callId: 'legacy-call-1' }, content } as unknown as ContentBlock
}

describe('projectContent', () => {
  it('passes text and reasoning blocks through verbatim', () => {
    expect(projectContent([
      { type: 'text', text: 'hello' },
      { type: 'reasoning', text: 'hmm' },
    ])).toBe('hello\nhmm')
  })

  it('renders tool calls and images compactly', () => {
    expect(projectContent([
      { type: 'tool-call', id: 'c1', name: 'bash', arguments: '{"command":"ls"}' } as unknown as ContentBlock,
      { type: 'image', source: { mediaType: 'image/png', data: 'x' } } as unknown as ContentBlock,
    ])).toBe('<tool-call bash({"command":"ls"})>\n[image]')
  })

  it('skips unknown block types (merge-extensible)', () => {
    expect(projectContent([{ type: 'unknown-future-block' } as unknown as ContentBlock])).toBe('')
  })

  // The V4 developer tool-change blocks are legal members of `ContentBlockMap`
  // that carry no model-visible text; falling through the default branch is the
  // contract, so pin it rather than leaving it to the type system.
  it('skips the V4 developer tool-change blocks', () => {
    expect(projectContent([
      { type: 'tool-addition', toolName: 'bash' },
      { type: 'tool-removal', toolName: 'bash' },
    ] as ContentBlock[])).toBe('')
  })
})

/**
 * The retired-V3 read compatibility gate. Two cases keep the pre-upgrade read
 * reachable, and the V4 controls below prove the gate cannot pass by projecting
 * a marker the block projection is no longer responsible for.
 */
describe('retired V3 tool-result wrapper compatibility (read-only)', () => {
  it('still projects content nested in a pre-upgrade V3 result wrapper', () => {
    expect(projectContent([retiredV3Wrapper([{ type: 'text', text: 'done' }])])).toBe('done')
  })

  it('still projects every nested block of a pre-upgrade V3 wrapper, in order', () => {
    expect(projectContent([
      retiredV3Wrapper([
        { type: 'text', text: 'line one' },
        { type: 'tool-call', id: CallId('c2'), name: 'read', arguments: '{}' },
        { type: 'text', text: 'line two' },
      ]),
    ])).toBe('line one\n<tool-call read({})>\nline two')
  })

  it('recognises only a wrapper that actually carries nested content', () => {
    expect(isRetiredToolResultWrapper({ type: 'tool-result', content: [] })).toBe(true)
    // A same-tagged record without array content is not the retired wrapper, so
    // the projection must not recurse into it.
    expect(isRetiredToolResultWrapper({ type: 'tool-result', content: 'not-an-array' })).toBe(false)
    expect(isRetiredToolResultWrapper({ type: 'tool-result' })).toBe(false)
    expect(isRetiredToolResultWrapper({ type: 'text', text: 'x' })).toBe(false)
    expect(isRetiredToolResultWrapper(null)).toBe(false)
  })
})

/**
 * V4 controls: a first-class tool result is a `role: 'tool'` MESSAGE carrying
 * top-level `content` and `isError` — never a content block. These pin the
 * shape the plugin actually meets on the pinned 0.1.7 host.
 */
describe('V4 first-class tool-role messages', () => {
  it('marks a failed V4 tool result at message level', () => {
    const message: { content: ContentBlock[]; isError?: boolean } = { content: [{ type: 'text', text: 'boom' }], isError: true }
    expect(projectToolMessage(message)).toBe('boom [error]')
  })

  it('leaves a successful V4 tool result unmarked', () => {
    const message: { content: ContentBlock[]; isError?: boolean } = { content: [{ type: 'text', text: 'file.txt' }], isError: false }
    expect(projectToolMessage(message)).toBe('file.txt')
  })

  it('leaves a V4 tool result unmarked when isError is absent', () => {
    // `isError` is optional on `ToolResultMessage`; absent means success.
    expect(projectToolMessage({ content: [{ type: 'text', text: 'ok' }] })).toBe('ok')
  })

  it('projects a bare V4 tool result without inventing an error marker', () => {
    // The block projection alone is not responsible for the marker: `[error]`
    // comes from the message, so plain content must never gain one.
    expect(projectContent([{ type: 'text', text: 'boom' }])).toBe('boom')
  })

  it('routes tool-role messages through the message-level projection', () => {
    const tool = { role: 'tool', content: [{ type: 'text', text: 'boom' }], isError: true } as unknown as Message
    expect(projectMessageContent(tool)).toBe('boom [error]')
    expect(projectMessage(tool)).toBe('[tool] boom [error]')
  })

  it('routes non-tool roles through the plain block projection', () => {
    const assistant = { role: 'assistant', content: [{ type: 'text', text: 'hi' }] } as unknown as Message
    expect(projectMessageContent(assistant)).toBe('hi')
  })
})

describe('projectMessage', () => {
  it('prefixes the role', () => {
    const message = { role: 'user', content: [{ type: 'text', text: 'hi' }] } as unknown as Message
    expect(projectMessage(message)).toBe('[user] hi')
  })
})
