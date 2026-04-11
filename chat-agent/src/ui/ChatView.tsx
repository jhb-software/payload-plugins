/// <reference lib="dom" />
'use client'

import type { UIMessage } from 'ai'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { AgentMode, MessageMetadata, ModelOption } from '../types.js'

import { BudgetWarning } from './BudgetWarning.js'
import { ChatInput } from './ChatInput.js'
import { MessageList } from './MessageList.js'
import { ModelSelector } from './ModelSelector.js'
import { ModeSelector } from './ModeSelector.js'
import { type ConversationSummary, Sidebar } from './Sidebar.js'
import { TokenBadge } from './TokenBadge.js'
import { type ChatMessageUI, useChat } from './use-chat.js'
import { useConversations } from './useConversations.js'
import { useTokenBudget } from './useTokenBudget.js'

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
  availableModes?: AgentMode[]
  conversationId?: string
  defaultMode?: AgentMode
  initialConversations?: ConversationSummary[]
  initialMessages?: unknown[]
}

// ---------------------------------------------------------------------------
// ChatView
// ---------------------------------------------------------------------------

export default function ChatView({
  availableModes = ['ask'],
  conversationId,
  defaultMode = 'ask',
  initialConversations,
  initialMessages: serverMessages,
}: ChatViewProps) {
  const endpointUrl = '/api/chat-agent/chat'
  const usageUrl = '/api/chat-agent/usage'
  const [chatId, setChatId] = useState(conversationId)
  const [mode, setMode] = useState<AgentMode>(defaultMode)
  const [modes, setModes] = useState<AgentMode[]>(availableModes)
  const [initialMessages, setInitialMessages] = useState<UIMessage<MessageMetadata>[] | undefined>(
    serverMessages as UIMessage<MessageMetadata>[] | undefined,
  )
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([])
  const [defaultModel, setDefaultModel] = useState<string | undefined>(undefined)
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined)

  // Fetch available models configuration on mount
  useEffect(() => {
    fetch(`${endpointUrl}/models`, { credentials: 'include' })
      .then((res) => res.json())
      .then((config: { availableModels: ModelOption[]; defaultModel: string }) => {
        setAvailableModels(config.availableModels)
        setDefaultModel(config.defaultModel)
        setSelectedModel((prev) => prev ?? config.defaultModel)
      })
      .catch(() => {
        // Models config not available — proceed without selector
      })
  }, [endpointUrl])

  // Fetch available modes on mount
  useEffect(() => {
    let cancelled = false
    fetch('/api/chat-agent/modes', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) {
          return
        }
        if (data.modes) {
          setModes(data.modes)
        }
        if (data.default) {
          setMode(data.default)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const setActiveChatId = useCallback((id: string | undefined) => {
    setChatId(id)
    setConversationParam(id)
  }, [])

  const { conversations, refresh, remove } = useConversations(endpointUrl, initialConversations)
  const {
    budget,
    exhausted,
    percentage,
    refresh: refreshBudget,
    warning,
  } = useTokenBudget(usageUrl)

  const { addToolApprovalResponse, error, messages, sendMessage, setMessages, status } = useChat({
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
      void refreshBudget()
    },
  })

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isLoading = status === 'streaming' || status === 'submitted'
  const chatDisabled = isLoading || exhausted

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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

  // --- Ask mode: tool approval handlers ------------------------------------

  const handleToolApprove = useCallback(
    (approvalId: string) => {
      void (addToolApprovalResponse as any)({ id: approvalId, approved: true })
    },
    [addToolApprovalResponse],
  )

  const handleToolDeny = useCallback(
    (approvalId: string) => {
      void (addToolApprovalResponse as any)({
        id: approvalId,
        approved: false,
        reason: 'User denied this action.',
      })
    },
    [addToolApprovalResponse],
  )

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 140px)' }}>
      <Sidebar
        chatId={chatId}
        conversations={conversations}
        onDelete={handleDelete}
        onLoad={handleLoad}
        onNew={newConversation}
      />
      <div
        style={{
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          minWidth: 0,
          padding: '24px',
        }}
      >
        <div
          style={{
            alignItems: 'center',
            borderBottom: '1px solid var(--theme-elevation-150)',
            display: 'flex',
            gap: '12px',
            marginBottom: '16px',
            paddingBottom: '12px',
          }}
        >
          <h2 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>Content Assistant</h2>
          <ModeSelector
            availableModes={modes}
            disabled={isLoading}
            mode={mode}
            onModeChange={setMode}
          />
          <div style={{ flex: 1 }} />
          {availableModels.length > 1 && (
            <ModelSelector
              available={availableModels}
              onChange={setSelectedModel}
              value={selectedModel ?? defaultModel ?? ''}
            />
          )}
          <TokenBadge messages={messages as UIMessage<MessageMetadata>[]} />
        </div>
        <MessageList
          isLoading={isLoading}
          messages={messages as UIMessage<MessageMetadata>[]}
          onToolApprove={handleToolApprove}
          onToolDeny={handleToolDeny}
          scrollRef={messagesEndRef}
        />
        <BudgetWarning
          budget={budget}
          exhausted={exhausted}
          percentage={percentage}
          warning={warning}
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
        <ChatInput disabled={chatDisabled} isLoading={isLoading} onSend={handleSend} />
      </div>
    </div>
  )
}
