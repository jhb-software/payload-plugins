// @vitest-environment jsdom
import type { UIMessage } from 'ai'

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

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

describe('useChat', () => {
  afterEach(cleanup)

  // Reproduces the bug where, after the very first message in a new
  // conversation is saved, the parent flips `chatId` from `undefined` to the
  // server-assigned id. Previously this caused the underlying AI SDK chat to
  // be recreated with empty messages, so the just-streamed user/assistant
  // pair vanished from the UI even though the URL retained the conversation
  // id.
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

  // When the user clicks a different conversation in the sidebar,
  // `loadConversation` calls `setMessages(msgs)` AND flips the `chatId`. The
  // new messages must be the ones that survive — not whatever was on screen
  // beforehand.
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
})
