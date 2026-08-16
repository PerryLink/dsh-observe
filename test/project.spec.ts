/**
 * Text projection of model-visible messages and content blocks — the strings
 * that become sanitized prompt/completion exports.
 * @module dsh-observe/test/project.spec
 */

import { describe, expect, it } from 'vitest'
import { projectContent, projectMessage } from '../src/project.ts'
import type { ContentBlock, Message } from '@deepseek-ai/dsh-llm'

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

  it('recurses into tool results and marks errors', () => {
    expect(projectContent([
      { type: 'tool-result', source: { callId: 'c1' }, content: [{ type: 'text', text: 'done' }], isError: false } as unknown as ContentBlock,
      { type: 'tool-result', source: { callId: 'c2' }, content: [{ type: 'text', text: 'boom' }], isError: true } as unknown as ContentBlock,
    ])).toBe('done\nboom [error]')
  })

  it('skips unknown block types (merge-extensible)', () => {
    expect(projectContent([{ type: 'unknown-future-block' } as unknown as ContentBlock])).toBe('')
  })
})

describe('projectMessage', () => {
  it('prefixes the role', () => {
    const message = { role: 'user', content: [{ type: 'text', text: 'hi' }] } as unknown as Message
    expect(projectMessage(message)).toBe('[user] hi')
  })
})
