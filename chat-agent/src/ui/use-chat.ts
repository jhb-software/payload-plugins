'use client'

/**
 * Thin wrapper around the Vercel AI SDK's useChat hook.
 *
 * Re-exports the hook with defaults configured for the chat agent endpoint,
 * plus conversation persistence via the chat-conversations collection.
 */

import type { UIMessage } from 'ai'

import { useChat as useAIChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useCallback, useMemo, useRef } from 'react'

import type { AgentMode, type MessageMetadata, messageMetadataSchema } from '../types.js'

export type ChatMessageUI = UIMessage<MessageMetadata>

export interface UseChatOptions {
  /** Existing conversation ID to resume. */
  chatId?: string
  endpointUrl?: string
  /** Pre-loaded messages (when resuming a conversation). */
  initialMessages?: UIMessage<MessageMetadata>[]
  /** Agent mode sent with each request. */
  mode?: AgentMode
  model?: string
  /** Called after messages are auto-saved. */
  onSave?: (conversationId: string) => void
}

/** Save or update a conversation via the REST API. */
async function saveConversation(
  baseUrl: string,
  conversationId: string | undefined,
  data: {
    messages: UIMessage<MessageMetadata>[]
    model?: string
    title?: string
    totalTokens?: number
  },
): Promise<string> {
  if (conversationId) {
    await fetch(`${baseUrl}/${conversationId}`, {
      body: JSON.stringify(data),
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    })
    return conversationId
  }
  const res = await fetch(baseUrl, {
    body: JSON.stringify(data),
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const doc = await res.json()
  return doc.id
}

/** Derive a title from the first user message. */
function titleFromMessages(messages: UIMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user')
  if (!firstUser) {
    return 'New conversation'
  }
  const text = firstUser.parts
    .filter((p): p is { text: string; type: 'text' } => p.type === 'text')
    .map((p) => p.text)
    .join('')
  return text.slice(0, 80) || 'New conversation'
}

export function useChat(options?: string | UseChatOptions) {
  const endpointUrl =
    typeof options === 'string' ? options : (options?.endpointUrl ?? '/api/chat-agent/chat')
  const model = typeof options === 'object' ? options?.model : undefined
  const mode = typeof options === 'object' ? options?.mode : undefined
  const chatId = typeof options === 'object' ? options?.chatId : undefined
  const initialMessages = typeof options === 'object' ? options?.initialMessages : undefined
  const onSave = typeof options === 'object' ? options?.onSave : undefined

  const conversationsUrl = `${endpointUrl}/conversations`
  const conversationIdRef = useRef<string | undefined>(chatId)

  const handleFinish = useCallback(
    async ({
      message,
      messages: allMessages,
    }: {
      message: UIMessage<MessageMetadata>
      messages: UIMessage<MessageMetadata>[]
    }) => {
      if (message.role !== 'assistant') {
        return
      }
      let totalTokens = 0
      for (const msg of allMessages) {
        if (msg.metadata?.totalTokens) {
          totalTokens += msg.metadata.totalTokens
        }
      }
      try {
        const id = await saveConversation(conversationsUrl, conversationIdRef.current, {
          messages: allMessages,
          model,
          title: titleFromMessages(allMessages),
          totalTokens,
        })
        conversationIdRef.current = id
        onSave?.(id)
      } catch {
        // Save failed silently — don't break the chat UX
      }
    },
    [conversationsUrl, model, onSave],
  )

  const transport = useMemo(() => {
    const body: Record<string, unknown> = {}
    if (model) {
      body.model = model
    }
    if (mode) {
      body.mode = mode
    }
    return new DefaultChatTransport({
      api: endpointUrl,
      body: Object.keys(body).length > 0 ? body : undefined,
      credentials: 'include',
    })
  }, [endpointUrl, mode, model])

  const chatOptions: Record<string, unknown> = {
    messageMetadataSchema,
    onFinish: handleFinish,
    transport,
  }
  if (chatId) {
    chatOptions.id = chatId
  }
  if (initialMessages) {
    chatOptions.messages = initialMessages
  }

  const chat = useAIChat(chatOptions as any)

  return {
    ...chat,
    conversationId: conversationIdRef.current,
  }
}
