'use client'

import React, { useState, useRef, useEffect, useCallback, type FormEvent } from 'react'
import { isToolUIPart, getToolName, type UIMessage } from 'ai'
import {
  Button,
  Pill,
  Banner,
  ShimmerEffect,
  Drawer,
  CheckboxInput,
  useModal,
} from '@payloadcms/ui'
import { useChat } from '@jhb.software/payload-chat-agent/client'
import type { MessageMetadata } from '@jhb.software/payload-chat-agent'

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------
//
// Per-million-token rates (USD) used purely for the dev app's cost display.
// Add a row here for any model you wire up in dev/src/payload.config.ts.

const MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', inputRate: 0.8, outputRate: 4 },
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', inputRate: 3, outputRate: 15 },
  { id: 'claude-opus-4-20250514', label: 'Claude Opus 4', inputRate: 15, outputRate: 75 },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', inputRate: 0.15, outputRate: 0.6 },
  { id: 'gpt-4o', label: 'GPT-4o', inputRate: 2.5, outputRate: 10 },
] as const

// ---------------------------------------------------------------------------
// Conversation list hook
// ---------------------------------------------------------------------------

interface ConversationSummary {
  id: string
  title: string
  updatedAt: string
}

function useConversations(baseUrl: string) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/conversations`, { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      setConversations(
        (data.docs ?? []).map((d: any) => ({
          id: d.id,
          title: d.title,
          updatedAt: d.updatedAt,
        })),
      )
    } catch {
      // silently ignore
    }
  }, [baseUrl])

  useEffect(() => {
    refresh()
  }, [refresh])

  const remove = useCallback(
    async (id: string) => {
      await fetch(`${baseUrl}/conversations/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      setConversations((prev) => prev.filter((c) => c.id !== id))
    },
    [baseUrl],
  )

  return { conversations, refresh, remove }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTextContent(msg: UIMessage): string {
  return msg.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
}

function computeUsage(messages: UIMessage<MessageMetadata>[]) {
  let inputTokens = 0
  let outputTokens = 0
  let totalTokens = 0
  let model: string | undefined
  for (const msg of messages) {
    if (msg.metadata) {
      inputTokens += msg.metadata.inputTokens ?? 0
      outputTokens += msg.metadata.outputTokens ?? 0
      totalTokens += msg.metadata.totalTokens ?? 0
      if (msg.metadata.model) model = msg.metadata.model
    }
  }
  return { inputTokens, outputTokens, totalTokens, model }
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return d.toLocaleDateString()
}

// ---------------------------------------------------------------------------
// Styles (using Payload CSS variables)
// ---------------------------------------------------------------------------

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: 'calc(100vh - 200px)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '1px solid var(--theme-elevation-150)',
  },
  title: { fontSize: '20px', fontWeight: 600, margin: 0 },
  headerActions: { display: 'flex', gap: '8px', alignItems: 'center' },
  messageList: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    paddingRight: '8px',
    paddingBottom: '16px',
  },
  messageRow: (isUser: boolean) => ({
    display: 'flex',
    justifyContent: isUser ? 'flex-end' : 'flex-start',
  }),
  bubble: (isUser: boolean) => ({
    maxWidth: '75%',
    padding: '10px 14px',
    borderRadius: '12px',
    fontSize: '14px',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    ...(isUser
      ? {
          background: 'var(--theme-success-500)',
          color: '#fff',
          borderBottomRightRadius: '4px',
        }
      : {
          background: 'var(--theme-elevation-100)',
          color: 'var(--theme-text)',
          borderBottomLeftRadius: '4px',
        }),
  }),
  toolRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '6px',
    marginTop: '8px',
  },
  inputArea: {
    display: 'flex',
    gap: '8px',
    marginTop: '16px',
    paddingTop: '12px',
    borderTop: '1px solid var(--theme-elevation-150)',
    alignItems: 'flex-end',
  },
  textarea: {
    flex: 1,
    padding: '10px 12px',
    fontSize: '14px',
    lineHeight: '1.5',
    border: '1px solid var(--theme-elevation-250)',
    borderRadius: '8px',
    resize: 'none' as const,
    fontFamily: 'inherit',
    background: 'var(--theme-input-bg, #fff)',
    color: 'var(--theme-text)',
    outline: 'none',
    minHeight: '44px',
    maxHeight: '120px',
  },
  usage: {
    display: 'flex',
    gap: '12px',
    padding: '6px 0',
    fontSize: '12px',
    color: 'var(--theme-elevation-500)',
    fontFamily: 'var(--font-mono, monospace)',
    flexWrap: 'wrap' as const,
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--theme-elevation-500)',
    fontSize: '15px',
  },
  select: {
    padding: '4px 8px',
    fontSize: '13px',
    border: '1px solid var(--theme-elevation-250)',
    borderRadius: '4px',
    background: 'var(--theme-elevation-50)',
    color: 'var(--theme-text)',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono, monospace)',
  },
  drawerConvItem: (active: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '10px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    background: active ? 'var(--theme-elevation-100)' : 'transparent',
    borderBottom: '1px solid var(--theme-elevation-100)',
  }),
  convTitle: {
    flex: 1,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
    fontSize: '14px',
  },
  convTime: {
    fontSize: '12px',
    color: 'var(--theme-elevation-400)',
    whiteSpace: 'nowrap' as const,
  },
} as const

const DRAWER_SLUG = 'chat-history'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChatClient() {
  const endpointUrl = '/api/chat-agent/chat'
  const [selectedModel, setSelectedModel] = useState<string>(MODELS[0].id)
  const [overrideAccess, setOverrideAccess] = useState(false)
  const [activeChatId, setActiveChatId] = useState<string | undefined>()
  const [initialMessages, setInitialMessages] = useState<any[] | undefined>()

  const { conversations, refresh, remove } = useConversations(endpointUrl)
  const { openModal, closeModal } = useModal()

  const chat = useChat({
    endpointUrl,
    model: selectedModel,
    overrideAccess,
    chatId: activeChatId,
    initialMessages,
    onSave: (id) => {
      if (!activeChatId) setActiveChatId(id)
      refresh()
    },
  })
  const { messages, status, error, sendMessage, setMessages } = chat
  const [input, setInput] = useState('')
  const isLoading = status === 'streaming' || status === 'submitted'

  const { inputTokens, outputTokens, totalTokens, model } = computeUsage(
    messages as UIMessage<MessageMetadata>[],
  )
  const modelInfo = MODELS.find((m) => m.id === (model ?? selectedModel))
  const cost = modelInfo
    ? (inputTokens * modelInfo.inputRate + outputTokens * modelInfo.outputRate) / 1_000_000
    : 0

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`
    }
  }, [input])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (input.trim() && !isLoading) {
      sendMessage({ text: input })
      setInput('')
    }
  }

  const newConversation = useCallback(() => {
    setActiveChatId(undefined)
    setInitialMessages(undefined)
    setMessages([])
  }, [setMessages])

  const loadConversation = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`${endpointUrl}/conversations/${id}`, {
          credentials: 'include',
        })
        if (!res.ok) return
        const doc = await res.json()
        setActiveChatId(id)
        setInitialMessages(doc.messages ?? [])
        setMessages(doc.messages ?? [])
        closeModal(DRAWER_SLUG)
      } catch {
        // silently ignore
      }
    },
    [endpointUrl, setMessages, closeModal],
  )

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Content Assistant</h2>
        <div style={styles.headerActions}>
          <select
            style={styles.select}
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={isLoading}
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <CheckboxInput
            label="Superuser"
            name="overrideAccess"
            checked={overrideAccess}
            onToggle={(e) => setOverrideAccess(e.target.checked)}
            readOnly={isLoading}
          />
          {messages.length > 0 && (
            <Button buttonStyle="secondary" size="small" onClick={newConversation}>
              New chat
            </Button>
          )}
          <Button buttonStyle="secondary" size="small" onClick={() => openModal(DRAWER_SLUG)}>
            History
          </Button>
        </div>
      </div>

      {/* Conversation history drawer */}
      <Drawer slug={DRAWER_SLUG} title="Chat History">
        <div style={{ padding: '8px 0' }}>
          {conversations.length === 0 ? (
            <p
              style={{ color: 'var(--theme-elevation-500)', textAlign: 'center', padding: '24px' }}
            >
              No conversations yet.
            </p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                style={styles.drawerConvItem(conv.id === activeChatId)}
                onClick={() => loadConversation(conv.id)}
              >
                <div style={styles.convTitle}>{conv.title}</div>
                <span style={styles.convTime}>{formatTime(conv.updatedAt)}</span>
                <Button
                  buttonStyle="icon-label"
                  size="small"
                  icon="x"
                  round
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation()
                    remove(conv.id)
                    if (conv.id === activeChatId) newConversation()
                  }}
                  tooltip="Delete conversation"
                />
              </div>
            ))
          )}
        </div>
      </Drawer>

      {/* Messages */}
      {messages.length === 0 ? (
        <div style={styles.empty}>Ask me anything about your content.</div>
      ) : (
        <div style={styles.messageList}>
          {messages.map((msg) => (
            <div key={msg.id} style={styles.messageRow(msg.role === 'user')}>
              <div>
                <div style={styles.bubble(msg.role === 'user')}>
                  {getTextContent(msg) || '\u2026'}
                </div>
                {/* Tool call pills */}
                {msg.parts.filter((p) => isToolUIPart(p)).length > 0 && (
                  <div style={styles.toolRow}>
                    {msg.parts
                      .filter((p) => isToolUIPart(p))
                      .map((p: any, i: number) => (
                        <Pill
                          key={i}
                          pillStyle={p.state === 'output-available' ? 'success' : 'warning'}
                          size="small"
                        >
                          {getToolName(p)}(
                          {p.state !== 'input-streaming' ? JSON.stringify(p.input) : '...'})
                        </Pill>
                      ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {/* Loading shimmer */}
          {isLoading && messages[messages.length - 1]?.role === 'user' && (
            <div style={styles.messageRow(false)}>
              <ShimmerEffect height="40px" width="200px" />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Error banner */}
      {error && <Banner type="error">{error.message}</Banner>}

      {/* Token usage */}
      {totalTokens > 0 && (
        <div style={styles.usage}>
          <span>In: {inputTokens.toLocaleString()}</span>
          <span>Out: {outputTokens.toLocaleString()}</span>
          <span>Total: {totalTokens.toLocaleString()}</span>
          <span>~${cost.toFixed(4)}</span>
        </div>
      )}

      {/* Input area */}
      <form style={styles.inputArea} onSubmit={onSubmit}>
        <textarea
          ref={textareaRef}
          style={styles.textarea}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (input.trim() && !isLoading) {
                sendMessage({ text: input })
                setInput('')
              }
            }
          }}
          placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
          rows={1}
          disabled={isLoading}
        />
        <Button
          type="submit"
          buttonStyle="primary"
          size="medium"
          disabled={!input.trim() || isLoading}
        >
          {isLoading ? 'Sending...' : 'Send'}
        </Button>
      </form>
    </div>
  )
}
