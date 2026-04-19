import type { ModelMessage } from 'ai'

import { describe, expect, it } from 'vitest'

import { sanitizeOrphanToolCalls } from './sanitize-tool-calls.js'

/**
 * Regression coverage for the Anthropic-observable failure:
 *
 *   messages.N: `tool_use` ids were found without `tool_result` blocks
 *   immediately after: toolu_... Each `tool_use` block must have a
 *   corresponding `tool_result` block in the next message
 *
 * Which also has a dual failing under other providers when a stored
 * conversation contains a stray `tool_result` with no preceding `tool_use`.
 *
 * The sanitizer operates on the ModelMessage[] produced by
 * `convertToModelMessages` and is the last line of defence before the
 * request reaches the provider.
 */
describe('sanitizeOrphanToolCalls', () => {
  it('keeps a matched tool-call + tool-result pair untouched', () => {
    const messages: ModelMessage[] = [
      { content: 'find X', role: 'user' },
      {
        content: [{ type: 'tool-call', input: { q: 'X' }, toolCallId: 'call_1', toolName: 'find' }],
        role: 'assistant',
      },
      {
        content: [
          {
            type: 'tool-result',
            output: { type: 'json', value: { hits: 1 } },
            toolCallId: 'call_1',
            toolName: 'find',
          },
        ],
        role: 'tool',
      },
    ]

    expect(sanitizeOrphanToolCalls(messages)).toEqual(messages)
  })

  it('drops an orphan tool-call whose result never came back (Anthropic error shape)', () => {
    // Exactly reproduces what Anthropic rejects: an assistant message holds a
    // `tool_use` and the next message is a plain user turn instead of the
    // required `tool_result`. Left alone, the provider returns
    // `tool_use ids were found without tool_result blocks immediately after`.
    const messages: ModelMessage[] = [
      { content: 'find X', role: 'user' },
      {
        content: [
          { type: 'text', text: 'let me search' },
          {
            type: 'tool-call',
            input: { q: 'X' },
            toolCallId: 'toolu_01E7pmk8d3gwFDfmdzzeLUQ1',
            toolName: 'find',
          },
        ],
        role: 'assistant',
      },
      { content: 'any follow-up', role: 'user' },
    ]

    const sanitized = sanitizeOrphanToolCalls(messages)

    const toolCallIds = collectToolCallIds(sanitized)
    expect(toolCallIds).not.toContain('toolu_01E7pmk8d3gwFDfmdzzeLUQ1')
    // The surrounding text part must survive so the assistant turn isn't lost.
    expect(sanitized[1]).toEqual({
      content: [{ type: 'text', text: 'let me search' }],
      role: 'assistant',
    })
  })

  it('drops the entire assistant message when its only content was the orphan tool-call', () => {
    const messages: ModelMessage[] = [
      { content: 'find X', role: 'user' },
      {
        content: [
          { type: 'tool-call', input: { q: 'X' }, toolCallId: 'call_orphan', toolName: 'find' },
        ],
        role: 'assistant',
      },
      { content: 'are you there?', role: 'user' },
    ]

    const sanitized = sanitizeOrphanToolCalls(messages)

    expect(sanitized).toEqual([
      { content: 'find X', role: 'user' },
      { content: 'are you there?', role: 'user' },
    ])
  })

  it('drops an orphan tool-result with no preceding tool-call', () => {
    // The inverse failure mode: a stored conversation has a `tool` message
    // whose matching `tool-call` was already pruned (e.g. by a previous
    // sanitization pass on the client) so the provider sees an unsolicited
    // `tool_result`.
    const messages: ModelMessage[] = [
      { content: 'hi', role: 'user' },
      {
        content: [
          {
            type: 'tool-result',
            output: { type: 'text', value: 'stale' },
            toolCallId: 'call_ghost',
            toolName: 'find',
          },
        ],
        role: 'tool',
      },
      { content: [{ type: 'text', text: 'hello' }], role: 'assistant' },
    ]

    const sanitized = sanitizeOrphanToolCalls(messages)

    expect(sanitized).toEqual([
      { content: 'hi', role: 'user' },
      { content: [{ type: 'text', text: 'hello' }], role: 'assistant' },
    ])
  })

  it('drops both the orphan tool-call and the adjacent orphan tool-result for the same id', () => {
    // A partial round-trip from a different bug path: a tool-call emitted with
    // its tool-result stubbed as `undefined` output was serialized and then
    // truncated on reload. Both halves should disappear — keeping either one
    // still trips the provider validation.
    const messages: ModelMessage[] = [
      {
        content: [
          { type: 'tool-call', input: { q: 'X' }, toolCallId: 'call_half', toolName: 'find' },
        ],
        role: 'assistant',
      },
      { content: 'something else entirely', role: 'user' },
    ]

    const sanitized = sanitizeOrphanToolCalls(messages)
    expect(collectToolCallIds(sanitized)).toEqual([])
  })

  it('preserves tool-approval-request and tool-approval-response parts (they use approvalId, not toolCallId pairing)', () => {
    // These are a separate pairing mechanism the sanitizer must not touch —
    // dropping them would break the ask-mode approval flow even when every
    // tool_use has its tool_result.
    const messages = [
      {
        content: [
          { type: 'tool-approval-request', approvalId: 'approve_1', toolCallId: 'call_1' },
        ],
        role: 'assistant',
      },
      {
        content: [{ type: 'tool-approval-response', approvalId: 'approve_1', approved: true }],
        role: 'tool',
      },
    ] as unknown as ModelMessage[]

    expect(sanitizeOrphanToolCalls(messages)).toEqual(messages)
  })

  it('leaves string-content user/system messages alone', () => {
    const messages: ModelMessage[] = [
      { content: 'be nice', role: 'system' },
      { content: 'hi', role: 'user' },
    ]

    expect(sanitizeOrphanToolCalls(messages)).toEqual(messages)
  })

  it('handles multiple tool-call + tool-result pairs across many turns', () => {
    const messages: ModelMessage[] = [
      { content: 'do the thing', role: 'user' },
      {
        content: [
          { type: 'tool-call', input: { a: 1 }, toolCallId: 'a', toolName: 't' },
          { type: 'tool-call', input: { b: 2 }, toolCallId: 'b', toolName: 't' },
        ],
        role: 'assistant',
      },
      {
        content: [
          { type: 'tool-result', output: { type: 'text', value: 'A' }, toolCallId: 'a', toolName: 't' },
          { type: 'tool-result', output: { type: 'text', value: 'B' }, toolCallId: 'b', toolName: 't' },
        ],
        role: 'tool',
      },
      {
        content: [{ type: 'tool-call', input: { c: 3 }, toolCallId: 'c_orphan', toolName: 't' }],
        role: 'assistant',
      },
      { content: 'ignore that', role: 'user' },
    ]

    const sanitized = sanitizeOrphanToolCalls(messages)
    expect(collectToolCallIds(sanitized).sort()).toEqual(['a', 'a', 'b', 'b'])
  })
})

function collectToolCallIds(messages: ModelMessage[]): string[] {
  const ids: string[] = []
  for (const msg of messages) {
    if (!Array.isArray(msg.content)) {
      continue
    }
    for (const part of msg.content as Array<{ toolCallId?: string; type: string }>) {
      if ((part.type === 'tool-call' || part.type === 'tool-result') && part.toolCallId) {
        ids.push(part.toolCallId)
      }
    }
  }
  return ids
}
