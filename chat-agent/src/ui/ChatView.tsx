/// <reference lib="dom" />
'use client'

import type { UIMessage } from 'ai'

import { Button, SetStepNav } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

import type { AgentMode, MessageMetadata, ModelOption } from '../types.js'

import { ChatInput } from './ChatInput.js'
import { MessageList } from './MessageList.js'
import { ModelSelector } from './ModelSelector.js'
import { ModeSelector } from './ModeSelector.js'
import { type ConversationSummary, Sidebar } from './Sidebar.js'
import { TokenBadge } from './TokenBadge.js'
import { type ChatMessageUI, useChat } from './use-chat.js'
import { useConversations } from './useConversations.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setConversationParam(id: string | undefined) {
  const url = new URL(window.location.href)
  if (id) {
    url.searchParams.set('conversation', id)
  } else {
    url.searchParams.delete('conversation')
  }
  window.history.replaceState({}, '', url.toString())
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatViewProps {
  availableModels?: ModelOption[]
  availableModes?: AgentMode[]
  conversationId?: string
  defaultMode?: AgentMode
  defaultModel?: string
  initialConversations?: ConversationSummary[]
  initialMessages?: unknown[]
  /** Model id persisted on the conversation doc; used as the initial selection when resuming. */
  initialModel?: string
  suggestedPrompts?: string[]
}

// ---------------------------------------------------------------------------
// ChatView
// ---------------------------------------------------------------------------

export default function ChatView({
  availableModels = [],
  availableModes = ['ask'],
  conversationId,
  defaultMode = 'ask',
  defaultModel,
  initialConversations,
  initialMessages: serverMessages,
  initialModel,
  suggestedPrompts,
}: ChatViewProps) {
  const endpointUrl = '/api/chat-agent/chat'
  const [chatId, setChatId] = useState(conversationId)
  const [mode, setMode] = useState<AgentMode>(defaultMode)
  const [initialMessages, setInitialMessages] = useState<UIMessage<MessageMetadata>[] | undefined>(
    serverMessages as UIMessage<MessageMetadata>[] | undefined,
  )
  const [selectedModel, setSelectedModel] = useState<string | undefined>(
    initialModel ?? defaultModel,
  )

  const setActiveChatId = useCallback((id: string | undefined) => {
    setChatId(id)
    setConversationParam(id)
  }, [])

  const { conversations, refresh, remove, rename } = useConversations(
    endpointUrl,
    initialConversations,
  )

  const {
    addToolApprovalResponse,
    error,
    messages,
    regenerate,
    sendMessage,
    setMessages,
    status,
    stop,
  } = useChat({
    chatId,
    endpointUrl,
    initialMessages,
    mode,
    model: selectedModel,
    onSave: (id) => {
      if (!chatId) {
        setActiveChatId(id)
      }
      void refresh()
    },
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  const loadConversation = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`${endpointUrl}/conversations/${id}`, {
          credentials: 'include',
        })
        if (!res.ok) {
          return
        }
        const doc = await res.json()
        const msgs = (doc.messages ?? []) as ChatMessageUI[]
        setActiveChatId(id)
        setInitialMessages(msgs)
        setMessages(msgs)
        if (doc.model) {
          setSelectedModel(doc.model)
        }
      } catch {
        // silently ignore
      }
    },
    [endpointUrl, setActiveChatId, setMessages],
  )

  // Load conversation on mount only if server didn't provide messages
  useEffect(() => {
    if (conversationId && !serverMessages) {
      void loadConversation(conversationId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const newConversation = useCallback(() => {
    setActiveChatId(undefined)
    setInitialMessages(undefined)
    setMessages([])
    setSelectedModel(defaultModel)
  }, [setActiveChatId, setMessages, defaultModel])

  const handleDelete = useCallback(
    (id: string) => {
      void remove(id)
      if (id === chatId) {
        newConversation()
      }
    },
    [chatId, newConversation, remove],
  )

  const handleLoad = useCallback(
    (id: string) => {
      void loadConversation(id)
    },
    [loadConversation],
  )

  const handleSend = useCallback(
    (text: string) => {
      void sendMessage({ text })
    },
    [sendMessage],
  )

  const handleStop = useCallback(() => {
    void stop()
  }, [stop])

  const handleRetry = useCallback(() => {
    void regenerate()
  }, [regenerate])

  const handleEditMessage = useCallback(
    (messageId: string, newText: string) => {
      const msgIndex = messages.findIndex((m) => m.id === messageId)
      if (msgIndex === -1) {
        return
      }
      const truncated = messages.slice(0, msgIndex)
      setMessages(truncated as UIMessage<MessageMetadata>[])
      void sendMessage({ text: newText })
    },
    [messages, sendMessage, setMessages],
  )

  const handleRename = useCallback(
    (id: string, title: string) => {
      void rename(id, title)
    },
    [rename],
  )

  // --- Ask mode: tool approval handlers ------------------------------------

  const handleToolApprove = useCallback(
    (approvalId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void (addToolApprovalResponse as any)({ id: approvalId, approved: true })
    },
    [addToolApprovalResponse],
  )

  const handleToolDeny = useCallback(
    (approvalId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void (addToolApprovalResponse as any)({
        id: approvalId,
        approved: false,
        reason: 'User denied this action.',
      })
    },
    [addToolApprovalResponse],
  )

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        height: 'calc(100vh - var(--app-header-height))',
        padding: '0 var(--gutter-h) 24px',
      }}
    >
      <SetStepNav nav={[{ label: 'Chat' }]} />
      <header className="list-header">
        <div className="list-header__content">
          <div className="list-header__title-and-actions">
            <h1 className="list-header__title">Content Assistant</h1>
            <div className="list-header__title-actions">
              <Button
                buttonStyle="pill"
                icon="plus"
                iconPosition="left"
                margin={false}
                onClick={newConversation}
                size="small"
              >
                New chat
              </Button>
            </div>
          </div>
          <div className="list-header__actions">
            <ModeSelector
              availableModes={availableModes}
              disabled={isLoading}
              mode={mode}
              onModeChange={setMode}
            />
            {availableModels.length > 1 && (
              <ModelSelector
                available={availableModels}
                onChange={setSelectedModel}
                value={selectedModel ?? defaultModel ?? ''}
              />
            )}
            <TokenBadge messages={messages as UIMessage<MessageMetadata>[]} />
          </div>
        </div>
      </header>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Sidebar
          chatId={chatId}
          conversations={conversations}
          onDelete={handleDelete}
          onLoad={handleLoad}
          onRename={handleRename}
        />
        <div
          style={{
            display: 'flex',
            flex: 1,
            flexDirection: 'column',
            minWidth: 0,
            paddingLeft: 'var(--gutter-h)',
          }}
        >
          <MessageList
            isLoading={isLoading}
            // Keying by conversation id makes switching conversations a fresh
            // mount, so `MessageList` re-runs its initial pre-paint scroll-to-
            // bottom for every conversation. Without this, navigating to (or
            // reloading on) a different conversation re-uses the existing
            // `MessageList` instance whose `useLayoutEffect` already ran with
            // the previous conversation's messages and won't re-fire.
            key={chatId ?? 'new'}
            messages={messages as UIMessage<MessageMetadata>[]}
            onEditMessage={handleEditMessage}
            onRetry={handleRetry}
            onSendSuggestion={handleSend}
            onToolApprove={handleToolApprove}
            onToolDeny={handleToolDeny}
            suggestedPrompts={suggestedPrompts}
          />
          {error ? (
            <div
              style={{
                background: 'var(--theme-error-50, #fff5f5)',
                border: '1px solid var(--theme-error-200, #fcc)',
                borderRadius: '6px',
                color: 'var(--theme-error-500)',
                fontSize: '13px',
                marginTop: '8px',
                padding: '8px 12px',
              }}
            >
              {error.message}
            </div>
          ) : null}
          <ChatInput isLoading={isLoading} onSend={handleSend} onStop={handleStop} />
        </div>
      </div>
    </div>
  )
}
