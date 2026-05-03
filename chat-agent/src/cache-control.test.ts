import type { ModelMessage } from 'ai'

import { describe, expect, it } from 'vitest'

import { withTrailingCache } from './cache-control.js'

describe('withTrailingCache', () => {
  // Anthropic caps requests at 4 cache breakpoints; a long multi-step turn
  // would otherwise accumulate one per step.
  it('strips an ephemeral cache breakpoint from earlier messages', () => {
    const messages: ModelMessage[] = [
      {
        content: 'previous trailing cache',
        providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
        role: 'user',
      },
      { content: 'assistant text', role: 'assistant' },
      {
        content: [
          {
            type: 'tool-result',
            output: { type: 'json', value: { ok: true } },
            toolCallId: 'a',
            toolName: 'find',
          },
        ],
        role: 'tool',
      },
    ]

    const out = withTrailingCache(messages)
    expect(out[0].providerOptions).toBeUndefined()
    expect(out[1].providerOptions).toBeUndefined()
    expect(out[2].providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    })
  })

  it('preserves unrelated providerOptions when stripping the cache marker', () => {
    const messages: ModelMessage[] = [
      {
        content: 'with reasoning sibling',
        providerOptions: {
          anthropic: { cacheControl: { type: 'ephemeral' }, sendReasoning: true },
          openai: { reasoningEffort: 'medium' },
        },
        role: 'user',
      },
      { content: 'last', role: 'user' },
    ]
    const out = withTrailingCache(messages)
    expect(out[0].providerOptions).toEqual({
      anthropic: { sendReasoning: true },
      openai: { reasoningEffort: 'medium' },
    })
  })

  it('does not mutate the input array or its messages', () => {
    const messages: ModelMessage[] = [{ content: 'one', role: 'user' }]
    const snapshot = JSON.parse(JSON.stringify(messages))
    withTrailingCache(messages)
    expect(messages).toEqual(snapshot)
  })
})
