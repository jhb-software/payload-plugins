'use client'

import { useCallback, useEffect, useState } from 'react'

import type { ConversationSummary } from './Sidebar.js'

export function useConversations(baseUrl: string, initial?: ConversationSummary[]) {
  const [conversations, setConversations] = useState<ConversationSummary[]>(initial ?? [])
  const [loading, setLoading] = useState(!initial)

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
