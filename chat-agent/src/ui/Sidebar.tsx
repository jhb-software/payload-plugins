'use client'

import { Button } from '@payloadcms/ui'
import React, { useCallback, useMemo, useRef, useState } from 'react'

import { SearchIcon } from './icons/SearchIcon.js'

export interface ConversationSummary {
  id: string
  title: string
  updatedAt: string
}

export function Sidebar({
  chatId,
  conversations,
  onDelete,
  onLoad,
  onNew,
  onRename,
}: {
  chatId: string | undefined
  conversations: ConversationSummary[]
  onDelete: (id: string) => void
  onLoad: (id: string) => void
  onNew: () => void
  onRename?: (id: string, title: string) => void
}) {
  const [search, setSearch] = useState('')
  const [renamingId, setRenamingId] = useState<null | string>(null)
  const [renameText, setRenameText] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)

  const filteredConversations = useMemo(() => {
    if (!search.trim()) {
      return conversations
    }
    const query = search.toLowerCase()
    return conversations.filter((c) => c.title.toLowerCase().includes(query))
  }, [conversations, search])

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation()
      if (window.confirm('Delete this conversation?')) {
        onDelete(id)
      }
    },
    [onDelete],
  )

  const startRename = useCallback(
    (e: React.MouseEvent, conv: ConversationSummary) => {
      e.stopPropagation()
      if (!onRename) {
        return
      }
      setRenamingId(conv.id)
      setRenameText(conv.title)
      setTimeout(() => renameRef.current?.focus(), 0)
    },
    [onRename],
  )

  const submitRename = useCallback(() => {
    if (renamingId && renameText.trim() && onRename) {
      onRename(renamingId, renameText.trim())
    }
    setRenamingId(null)
  }, [renamingId, renameText, onRename])

  const cancelRename = useCallback(() => {
    setRenamingId(null)
  }, [])

  return (
    <div
      style={{
        borderRight: '1px solid var(--theme-elevation-150)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
        width: '260px',
      }}
    >
      {/* New chat button */}
      <div style={{ borderBottom: '1px solid var(--theme-elevation-150)', padding: '12px' }}>
        <Button
          buttonStyle="secondary"
          icon="plus"
          iconPosition="left"
          onClick={onNew}
          size="small"
        >
          New chat
        </Button>
      </div>

      {/* Search input */}
      <div
        style={{
          borderBottom: '1px solid var(--theme-elevation-150)',
          padding: '8px 12px',
        }}
      >
        <div
          style={{
            alignItems: 'center',
            background: 'var(--theme-input-bg, var(--theme-bg))',
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: '6px',
            display: 'flex',
            gap: '6px',
            padding: '4px 8px',
          }}
        >
          <SearchIcon
            height="14"
            style={{ color: 'var(--theme-elevation-400)', flexShrink: 0 }}
            width="14"
          />
          <input
            aria-label="Search conversations"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--theme-text)',
              flex: 1,
              fontSize: '12px',
              outline: 'none',
              padding: '2px 0',
            }}
            type="text"
            value={search}
          />
          {search ? (
            <button
              onClick={() => setSearch('')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--theme-elevation-400)',
                cursor: 'pointer',
                fontSize: '14px',
                lineHeight: 1,
                padding: 0,
              }}
              type="button"
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      {/* Conversation list */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          gap: '2px',
          overflowY: 'auto',
          padding: '8px',
        }}
      >
        {filteredConversations.length === 0 && search ? (
          <div
            style={{
              color: 'var(--theme-elevation-400)',
              fontSize: '12px',
              padding: '12px 10px',
              textAlign: 'center',
            }}
          >
            No conversations found
          </div>
        ) : null}
        {filteredConversations.map((conv) => {
          const isActive = conv.id === chatId
          const isRenaming = conv.id === renamingId

          return (
            <div
              key={conv.id}
              onClick={() => {
                if (!isRenaming) {
                  onLoad(conv.id)
                }
              }}
              onDoubleClick={(e) => startRename(e, conv)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isRenaming) {
                  onLoad(conv.id)
                }
              }}
              role="button"
              style={{
                alignItems: 'center',
                background: isActive ? 'var(--theme-elevation-100)' : 'transparent',
                borderLeft: isActive
                  ? '3px solid var(--theme-elevation-900)'
                  : '3px solid transparent',
                borderRadius: '4px',
                cursor: isRenaming ? 'default' : 'pointer',
                display: 'flex',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 400,
                gap: '4px',
                padding: '8px 10px',
              }}
              tabIndex={0}
            >
              {isRenaming ? (
                <input
                  aria-label="Rename conversation"
                  onBlur={submitRename}
                  onChange={(e) => setRenameText(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') {
                      submitRename()
                    } else if (e.key === 'Escape') {
                      cancelRename()
                    }
                  }}
                  ref={renameRef}
                  style={{
                    background: 'var(--theme-input-bg, var(--theme-bg))',
                    border: '1px solid var(--theme-elevation-300)',
                    borderRadius: '4px',
                    color: 'var(--theme-text)',
                    flex: 1,
                    fontSize: '13px',
                    outline: 'none',
                    padding: '2px 6px',
                  }}
                  type="text"
                  value={renameText}
                />
              ) : (
                <div
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {conv.title}
                </div>
              )}
              {!isRenaming ? (
                <Button
                  buttonStyle="icon-label"
                  icon="x"
                  onClick={(e: React.MouseEvent) => handleDeleteClick(e, conv.id)}
                  round
                  size="small"
                  tooltip="Delete conversation"
                />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
