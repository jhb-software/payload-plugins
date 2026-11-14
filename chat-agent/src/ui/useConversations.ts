'use client'

import { useCallback, useState } from 'react'

import type { ConversationSummary } from './Sidebar.js'

export function useConversations(baseUrl: string, initial: ConversationSummary[] = []) {
  const [conversations, setConversations] = useState<ConversationSummary[]>(initial)

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
    }
  }, [baseUrl])

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

  const rename = useCallback(
    async (id: string, title: string) => {
      try {
        await fetch(`${baseUrl}/conversations/${id}`, {
          body: JSON.stringify({ title }),
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          method: 'PATCH',
        })
        setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)))
      } catch {
        // silently ignore
      }
    },
    [baseUrl],
  )

  return { conversations, refresh, remove, rename }
}
