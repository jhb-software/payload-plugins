/// <reference lib="dom" />
'use client'

/**
 * Default chat view component for the Payload admin panel.
 *
 * Uses the AI SDK's useChat hook for streaming with conversation persistence.
 * This is a minimal reference implementation — users can provide their own
 * component via the adminView option.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { isToolUIPart, getToolName, type UIMessage } from 'ai'
// @ts-expect-error — @payloadcms/ui is a runtime peer dependency (always present in admin panel)
import { Button } from '@payloadcms/ui'
import { useChat, type ChatMessageUI } from './use-chat.js'
import type { MessageMetadata } from '../types.js'

// ---------------------------------------------------------------------------
// Token formatting
// ---------------------------------------------------------------------------

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
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
      if (!res.ok) return
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

  const { messages, status, error, sendMessage, setMessages } = useChat({
    endpointUrl,
    chatId: activeChatId,
    initialMessages,
    onSave: (id) => {
      if (!activeChatId) setActiveChatId(id)
      refresh()
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
        if (!res.ok) return
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
        height: 'calc(100vh - 200px)',
        maxWidth: '1100px',
        margin: '0 auto',
        gap: '1px',
      },
    },
    // Sidebar
    React.createElement(
      'div',
      {
        style: {
          width: '240px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--theme-elevation-150)',
          overflow: 'hidden',
        },
      },
      React.createElement(
        'div',
        {
          style: {
            padding: '12px',
            borderBottom: '1px solid var(--theme-elevation-150)',
          },
        },
        React.createElement(
          Button,
          {
            buttonStyle: 'secondary',
            size: 'small',
            icon: 'plus',
            iconPosition: 'left',
            onClick: newConversation,
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
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '8px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                background: conv.id === activeChatId ? 'var(--theme-elevation-100)' : 'transparent',
                marginBottom: '2px',
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
              size: 'small',
              round: true,
              tooltip: 'Delete conversation',
              onClick: (e: React.MouseEvent) => {
                e.stopPropagation()
                remove(conv.id)
                if (conv.id === activeChatId) newConversation()
              },
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
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '24px',
          minWidth: 0,
        },
      },
      // Header
      React.createElement(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            paddingBottom: '12px',
            borderBottom: '1px solid var(--theme-elevation-150)',
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
            if (meta?.totalTokens) total += meta.totalTokens
          }
          if (total === 0) return null
          return React.createElement(
            'span',
            {
              style: {
                fontSize: '12px',
                color: 'var(--theme-elevation-400)',
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
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--theme-elevation-400)',
                fontSize: '15px',
              },
            },
            'Ask me anything about your content.',
          )
        : React.createElement(
            'div',
            {
              style: {
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
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
                        maxWidth: '75%',
                        padding: '10px 14px',
                        borderRadius: '12px',
                        fontSize: '14px',
                        lineHeight: '1.5',
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
                      .map((p) => (p as { type: 'text'; text: string }).text)
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
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '4px 8px',
                            marginTop: '6px',
                            fontSize: '12px',
                            fontFamily: 'monospace',
                            background: 'var(--theme-elevation-50)',
                            border: '1px solid var(--theme-elevation-150)',
                            borderRadius: '4px',
                            color: 'var(--theme-elevation-500)',
                          },
                        },
                        React.createElement('span', {
                          style: {
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background:
                              p.state === 'output-available'
                                ? 'var(--theme-success-500, #34c759)'
                                : 'var(--theme-warning-500, #f5a623)',
                            flexShrink: 0,
                          },
                        }),
                        `${getToolName(p as Parameters<typeof getToolName>[0])}(${p.state !== 'input-streaming' ? JSON.stringify(p.input) : '...'})`,
                      ),
                    ),
                  // Per-message token usage (assistant only)
                  ...(() => {
                    const meta = msg.metadata as MessageMetadata | undefined
                    if (msg.role !== 'assistant' || !meta?.totalTokens) return []
                    return [
                      React.createElement(
                        'div',
                        {
                          key: 'tokens',
                          style: {
                            marginTop: '4px',
                            fontSize: '11px',
                            color: 'var(--theme-elevation-400)',
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
                padding: '8px 12px',
                marginTop: '8px',
                fontSize: '13px',
                color: 'var(--theme-error-500)',
                background: 'var(--theme-error-50, #fff5f5)',
                border: '1px solid var(--theme-error-200, #fcc)',
                borderRadius: '6px',
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
              sendMessage({ text: input })
              setInput('')
            }
          },
          style: {
            display: 'flex',
            gap: '8px',
            marginTop: '16px',
            paddingTop: '12px',
            borderTop: '1px solid var(--theme-elevation-150)',
          },
        },
        React.createElement('input', {
          type: 'text',
          value: input,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value),
          placeholder: 'Type a message\u2026',
          disabled: isLoading,
          style: {
            flex: 1,
            padding: '10px 12px',
            fontSize: '14px',
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: '8px',
            outline: 'none',
            background: 'var(--theme-input-bg, var(--theme-bg))',
            color: 'var(--theme-text)',
          },
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
