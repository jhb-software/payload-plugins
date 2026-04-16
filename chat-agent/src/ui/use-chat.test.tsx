// @vitest-environment jsdom
import type { UIMessage } from 'ai'

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MessageMetadata } from '../types.js'

import { useChat } from './use-chat.js'

const message = (
  id: string,
  role: 'assistant' | 'user',
  text: string,
): UIMessage<MessageMetadata> =>
  ({
    id,
    parts: [{ type: 'text' as const, text }],
    role,
  }) as UIMessage<MessageMetadata>

/** Minimal UIMessageChunk SSE payload that completes a single assistant turn. */
function sseStream(): string {
  // Keep keys in AI-SDK `UIMessageChunk` order (discriminator first).
  /* eslint-disable perfectionist/sort-objects */
  const chunks: Record<string, unknown>[] = [
    { type: 'start', messageId: 'asst-1' },
    { type: 'start-step' },
    { type: 'text-start', id: 't1' },
    { type: 'text-delta', id: 't1', delta: 'ok' },
    { type: 'text-end', id: 't1' },
    { type: 'finish-step' },
    { type: 'finish' },
  ]
  /* eslint-enable perfectionist/sort-objects */
  return chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n'
}

describe('useChat', () => {
  afterEach(cleanup)

  // Reproduces the first-save bug: after the very first message in a new
  // conversation is saved, the parent flips `chatId` from `undefined` to
  // the server-assigned id, which used to recreate the AI SDK's chat empty.
  it('keeps messages when chatId changes from undefined to a server id after first save', () => {
    const { rerender, result } = renderHook(
      ({ chatId }: { chatId: string | undefined }) =>
        useChat({ chatId, endpointUrl: '/api/chat-agent/chat' }),
      { initialProps: { chatId: undefined as string | undefined } },
    )

    act(() => {
      result.current.setMessages([
        message('m1', 'user', 'Hello'),
        message('m2', 'assistant', 'Hi there'),
      ])
    })
    expect(result.current.messages).toHaveLength(2)

    // Simulate the post-save transition: the parent calls
    // `setActiveChatId(serverId)` after `onSave` fires, so the next render of
    // ChatView passes the real chat id where there used to be `undefined`.
    rerender({ chatId: 'server-assigned-id' })

    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[0]?.id).toBe('m1')
    expect(result.current.messages[1]?.id).toBe('m2')
  })

  // Sidebar switch: `loadConversation` flips `chatId` AND calls
  // `setMessages(msgs)`. The new messages must win.
  it('surfaces messages set via setMessages when chatId also changes in the same render', () => {
    const { rerender, result } = renderHook(
      ({ chatId }: { chatId: string | undefined }) =>
        useChat({ chatId, endpointUrl: '/api/chat-agent/chat' }),
      { initialProps: { chatId: 'convo-a' as string | undefined } },
    )

    act(() => {
      result.current.setMessages([message('a1', 'user', 'A question')])
    })
    expect(result.current.messages).toHaveLength(1)

    act(() => {
      result.current.setMessages([
        message('b1', 'user', 'B question'),
        message('b2', 'assistant', 'B answer'),
      ])
      rerender({ chatId: 'convo-b' })
    })

    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages.map((m) => m.id)).toEqual(['b1', 'b2'])
  })

  // After a sidebar switch from convo-a to convo-b, the next save must
  // PATCH convo-b. Previously the hook cached the initial chatId in a ref
  // and never re-synced it, so saves silently overwrote the previous
  // conversation with the new one's messages.
  it('persists to the current chatId after a sidebar switch, not the previous one', async () => {
    const asUrl = (input: RequestInfo | URL): string =>
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = asUrl(input)
      if (url === '/api/chat-agent/chat') {
        return Promise.resolve(
          new Response(sseStream(), {
            headers: { 'Content-Type': 'text/event-stream' },
          }),
        )
      }
      if (init?.method === 'PATCH' || init?.method === 'POST') {
        const id = url.split('/').pop() ?? 'new'
        return Promise.resolve(
          new Response(JSON.stringify({ id }), {
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }
      throw new Error(`Unexpected fetch: ${init?.method ?? 'GET'} ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    try {
      const { rerender, result } = renderHook(
        ({ chatId }: { chatId: string | undefined }) =>
          useChat({ chatId, endpointUrl: '/api/chat-agent/chat' }),
        { initialProps: { chatId: 'convo-a' as string | undefined } },
      )

      rerender({ chatId: 'convo-b' })

      await act(async () => {
        await result.current.sendMessage({ text: 'hello in b' })
      })

      const saveCalls = fetchMock.mock.calls
        .map(([input]) => asUrl(input))
        .filter((url) => url.includes('/conversations/'))
      expect(saveCalls.length).toBeGreaterThan(0)
      for (const url of saveCalls) {
        expect(url).toContain('/convo-b')
        expect(url).not.toContain('/convo-a')
      }
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
