'use client'

/**
 * Thin wrapper around the Vercel AI SDK's useChat hook.
 *
 * Re-exports the hook with defaults configured for the chat agent endpoint,
 * plus conversation persistence via the chat-conversations collection.
 */

import type { UIMessage } from 'ai'

import { useChat as useAIChat } from '@ai-sdk/react'
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai'
import { useCallback, useMemo, useRef } from 'react'

import { type AgentMode, type MessageMetadata, messageMetadataSchema } from '../types.js'

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

/**
 * Save or update a conversation via the REST API.
 *
 * `totalTokens` is intentionally not part of the payload — the server derives
 * it from `metadata.totalTokens` on each message to keep usage metrics
 * consistent with the message list.
 */
async function saveConversation(
  baseUrl: string,
  conversationId: string | undefined,
  data: {
    messages: UIMessage<MessageMetadata>[]
    mode?: AgentMode
    model?: string
    title?: string
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

  // Keep a live view of messages so the error handler can read the latest
  // state without re-memoizing (AI SDK's `onError` signature only receives the
  // Error, not the message list).
  const messagesRef = useRef<UIMessage<MessageMetadata>[]>(initialMessages ?? [])

  const persistMessages = useCallback(
    async (allMessages: UIMessage<MessageMetadata>[]) => {
      try {
        const id = await saveConversation(conversationsUrl, conversationIdRef.current, {
          messages: allMessages,
          mode,
          model,
          title: titleFromMessages(allMessages),
        })
        conversationIdRef.current = id
        onSave?.(id)
      } catch {
        // Save failed silently — don't break the chat UX
      }
    },
    [conversationsUrl, mode, model, onSave],
  )

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
      await persistMessages(allMessages)
    },
    [persistMessages],
  )

  // Persist the user's message when the stream fails so it survives a reload
  // and the user can retry without retyping. The error itself stays ephemeral
  // in `useChat`'s `error` state — we never save error text as an assistant
  // message (that would pollute retries and get resent to the model).
  const handleError = useCallback(() => {
    const msgs = messagesRef.current
    if (msgs.length === 0) {
      return
    }
    void persistMessages(msgs)
  }, [persistMessages])

  // --- Transport with live model/mode -------------------------------------
  // The AI SDK's useChat caches the transport on mount, so memoizing a new
  // transport when `model`/`mode` change does not take effect on rerender.
  // Instead, hold the latest values in refs and inject them via
  // `prepareSendMessagesRequest`, which is called fresh on every send
  // (including auto-sends triggered by tool approvals).
  const modelRef = useRef(model)
  const modeRef = useRef(mode)
  modelRef.current = model
  modeRef.current = mode

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: endpointUrl,
        credentials: 'include',
        prepareSendMessagesRequest: ({ api, body, credentials, headers, messages }) => {
          const nextBody: Record<string, unknown> = { ...(body ?? {}), messages }
          if (modelRef.current) {
            nextBody.model = modelRef.current
          }
          if (modeRef.current) {
            nextBody.mode = modeRef.current
          }
          return { api, body: nextBody, credentials, headers }
        },
      }),
    [endpointUrl],
  )

  const chatOptions: Record<string, unknown> = {
    messageMetadataSchema,
    onError: handleError,
    onFinish: handleFinish,
    // When the user approves/denies a pending tool call, resubmit automatically
    // so the server can execute (or skip) the tool and continue the stream.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    transport,
  }
  // Intentionally do NOT pass `chatId` as the AI SDK's `id`. Our `chatId` is
  // the persistence id (used by `saveConversation` to choose POST vs PATCH);
  // the AI SDK's `id` keys its internal Chat instance and any change to it
  // tears down the current chat and replaces it with an empty one. Coupling
  // them caused the just-streamed messages of a brand-new conversation to
  // disappear the instant the first save flipped `chatId` from `undefined`
  // to the server-assigned id (the URL kept the id, but the UI fell back to
  // the empty "new chat" state). `loadConversation` and `newConversation`
  // already drive the message list explicitly via `setMessages`, so the AI
  // SDK never needs to know about the persistence id.
  if (initialMessages) {
    chatOptions.messages = initialMessages
  }

  const chat = useAIChat(chatOptions as any)
  messagesRef.current = chat.messages as UIMessage<MessageMetadata>[]

  return {
    ...chat,
    conversationId: conversationIdRef.current,
  }
}
