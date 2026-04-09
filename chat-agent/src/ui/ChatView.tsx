/// <reference lib="dom" />
'use client'

/**
 * Default chat view component for the Payload admin panel.
 *
 * Uses the AI SDK's useChat hook for streaming with conversation persistence.
 * This is a minimal reference implementation — users can provide their own
 * component via the adminView option.
 */

import { Button } from '@payloadcms/ui'
import { getToolName, isToolUIPart, type UIMessage } from 'ai'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import type { MessageMetadata } from '../types.js'

import { type ChatMessageUI, useChat } from './use-chat.js'

// ---------------------------------------------------------------------------
// Token formatting
// ---------------------------------------------------------------------------

function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}k`
  }
  return String(n)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConversationSummary {
  id: string
  title: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Conversation list hook
// ---------------------------------------------------------------------------

function useConversations(baseUrl: string) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/conversations`, {
        credentials: 'include',
      })
      if (!res.ok) {
        return
      }
      const data = await res.json()
      setConversations(
        (data.docs ?? []).map((d: Record<string, unknown>) => ({
          id: d.id,
          title: d.title,
          updatedAt: d.updatedAt,
        })),
      )
    } catch {
      // silently ignore
    } finally {
      setLoading(false)
    }
  }, [baseUrl])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const remove = useCallback(
    async (id: string) => {
      await fetch(`${baseUrl}/conversations/${id}`, {
        credentials: 'include',
        method: 'DELETE',
      })
      setConversations((prev) => prev.filter((c) => c.id !== id))
    },
    [baseUrl],
  )

  return { conversations, loading, refresh, remove }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChatView() {
  const endpointUrl = '/api/chat-agent/chat'
  const [activeChatId, setActiveChatId] = useState<string | undefined>()
  const [initialMessages, setInitialMessages] = useState<UIMessage<MessageMetadata>[] | undefined>()

  const { conversations, refresh, remove } = useConversations(endpointUrl)

  const { error, messages, sendMessage, setMessages, status } = useChat({
    chatId: activeChatId,
    endpointUrl,
    initialMessages,
    onSave: (id) => {
      if (!activeChatId) {
        setActiveChatId(id)
      }
      void refresh()
    },
  })

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isLoading = status === 'streaming' || status === 'submitted'

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
      } catch {
        // silently ignore
      }
    },
    [endpointUrl, setMessages],
  )

  const newConversation = useCallback(() => {
    setActiveChatId(undefined)
    setInitialMessages(undefined)
    setMessages([])
  }, [setMessages])

  return React.createElement(
    'div',
    {
      style: {
        display: 'flex',
        gap: '1px',
        height: 'calc(100vh - 200px)',
        margin: '0 auto',
        maxWidth: '1100px',
      },
    },
    // Sidebar
    React.createElement(
      'div',
      {
        style: {
          borderRight: '1px solid var(--theme-elevation-150)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          overflow: 'hidden',
          width: '240px',
        },
      },
      React.createElement(
        'div',
        {
          style: {
            borderBottom: '1px solid var(--theme-elevation-150)',
            padding: '12px',
          },
        },
        React.createElement(
          Button,
          {
            buttonStyle: 'secondary',
            icon: 'plus',
            iconPosition: 'left',
            onClick: newConversation,
            size: 'small',
          },
          'New chat',
        ),
      ),
      React.createElement(
        'div',
        {
          style: {
            flex: 1,
            overflowY: 'auto',
            padding: '8px',
          },
        },
        ...conversations.map((conv) =>
          React.createElement(
            'div',
            {
              key: conv.id,
              style: {
                alignItems: 'center',
                background: conv.id === activeChatId ? 'var(--theme-elevation-100)' : 'transparent',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                fontSize: '13px',
                gap: '4px',
                marginBottom: '2px',
                padding: '8px',
              },
            },
            React.createElement(
              'div',
              {
                onClick: () => loadConversation(conv.id),
                style: {
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
              },
              conv.title,
            ),
            React.createElement(Button, {
              buttonStyle: 'icon-label',
              icon: 'x',
              onClick: (e: React.MouseEvent) => {
                e.stopPropagation()
                void remove(conv.id)
                if (conv.id === activeChatId) {
                  newConversation()
                }
              },
              round: true,
              size: 'small',
              tooltip: 'Delete conversation',
            }),
          ),
        ),
      ),
    ),
    // Main chat area
    React.createElement(
      'div',
      {
        style: {
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          minWidth: 0,
          padding: '24px',
        },
      },
      // Header
      React.createElement(
        'div',
        {
          style: {
            alignItems: 'center',
            borderBottom: '1px solid var(--theme-elevation-150)',
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '16px',
            paddingBottom: '12px',
          },
        },
        React.createElement(
          'h2',
          { style: { fontSize: '20px', fontWeight: 600, margin: 0 } },
          'Content Assistant',
        ),
        (() => {
          let total = 0
          for (const msg of messages) {
            const meta = msg.metadata as MessageMetadata | undefined
            if (meta?.totalTokens) {
              total += meta.totalTokens
            }
          }
          if (total === 0) {
            return null
          }
          return React.createElement(
            'span',
            {
              style: {
                color: 'var(--theme-elevation-400)',
                fontSize: '12px',
                fontWeight: 400,
              },
            },
            `${formatTokens(total)} tokens`,
          )
        })(),
      ),
      // Messages
      messages.length === 0
        ? React.createElement(
            'div',
            {
              style: {
                alignItems: 'center',
                color: 'var(--theme-elevation-400)',
                display: 'flex',
                flex: 1,
                fontSize: '15px',
                justifyContent: 'center',
              },
            },
            'Ask me anything about your content.',
          )
        : React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                flex: 1,
                flexDirection: 'column',
                gap: '12px',
                overflowY: 'auto',
              },
            },
            ...messages.map((msg) =>
              React.createElement(
                'div',
                {
                  key: msg.id,
                  style: {
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  },
                },
                React.createElement(
                  'div',
                  null,
                  React.createElement(
                    'div',
                    {
                      style: {
                        borderRadius: '12px',
                        fontSize: '14px',
                        lineHeight: '1.5',
                        maxWidth: '75%',
                        padding: '10px 14px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        ...(msg.role === 'user'
                          ? {
                              background: 'var(--theme-elevation-900)',
                              color: 'var(--theme-bg)',
                            }
                          : {
                              background: 'var(--theme-elevation-50)',
                              color: 'var(--theme-text)',
                            }),
                      },
                    },
                    msg.parts
                      .filter((p) => p.type === 'text')
                      .map((p) => (p as { text: string; type: 'text' }).text)
                      .join('') || '\u2026',
                  ),
                  ...msg.parts
                    .filter((p) => isToolUIPart(p))
                    .map((p, i: number) =>
                      React.createElement(
                        'div',
                        {
                          key: i,
                          style: {
                            alignItems: 'center',
                            background: 'var(--theme-elevation-50)',
                            border: '1px solid var(--theme-elevation-150)',
                            borderRadius: '4px',
                            color: 'var(--theme-elevation-500)',
                            display: 'flex',
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            gap: '6px',
                            marginTop: '6px',
                            padding: '4px 8px',
                          },
                        },
                        React.createElement('span', {
                          style: {
                            background:
                              p.state === 'output-available'
                                ? 'var(--theme-success-500, #34c759)'
                                : 'var(--theme-warning-500, #f5a623)',
                            borderRadius: '50%',
                            flexShrink: 0,
                            height: '6px',
                            width: '6px',
                          },
                        }),
                        `${getToolName(p)}(${p.state !== 'input-streaming' ? JSON.stringify(p.input) : '...'})`,
                      ),
                    ),
                  // Per-message token usage (assistant only)
                  ...(() => {
                    const meta = msg.metadata as MessageMetadata | undefined
                    if (msg.role !== 'assistant' || !meta?.totalTokens) {
                      return []
                    }
                    return [
                      React.createElement(
                        'div',
                        {
                          key: 'tokens',
                          style: {
                            color: 'var(--theme-elevation-400)',
                            fontSize: '11px',
                            marginTop: '4px',
                          },
                        },
                        [meta.model, formatTokens(meta.totalTokens)].filter(Boolean).join(' · '),
                      ),
                    ]
                  })(),
                ),
              ),
            ),
            React.createElement('div', { ref: messagesEndRef }),
          ),
      // Error
      error
        ? React.createElement(
            'div',
            {
              style: {
                background: 'var(--theme-error-50, #fff5f5)',
                border: '1px solid var(--theme-error-200, #fcc)',
                borderRadius: '6px',
                color: 'var(--theme-error-500)',
                fontSize: '13px',
                marginTop: '8px',
                padding: '8px 12px',
              },
            },
            error.message,
          )
        : null,
      // Input
      React.createElement(
        'form',
        {
          onSubmit: (e: React.FormEvent) => {
            e.preventDefault()
            if (input.trim() && !isLoading) {
              void sendMessage({ text: input })
              setInput('')
            }
          },
          style: {
            borderTop: '1px solid var(--theme-elevation-150)',
            display: 'flex',
            gap: '8px',
            marginTop: '16px',
            paddingTop: '12px',
          },
        },
        React.createElement('input', {
          type: 'text',
          disabled: isLoading,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value),
          placeholder: 'Type a message\u2026',
          style: {
            background: 'var(--theme-input-bg, var(--theme-bg))',
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: '8px',
            color: 'var(--theme-text)',
            flex: 1,
            fontSize: '14px',
            outline: 'none',
            padding: '10px 12px',
          },
          value: input,
        }),
        React.createElement(
          Button,
          {
            type: 'submit',
            disabled: !input.trim() || isLoading,
            size: 'medium',
          },
          isLoading ? 'Sending\u2026' : 'Send',
        ),
      ),
    ),
  )
}
