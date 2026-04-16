'use client'

import { Button } from '@payloadcms/ui'
import React, { useCallback, useMemo, useRef, useState } from 'react'

import { SearchIcon } from './icons/SearchIcon.js'
import './Sidebar.css'

export interface ConversationSummary {
  id: string
  title: string
  updatedAt: string
}

export function Sidebar({
  chatId,
  className,
  conversations,
  onClose,
  onDelete,
  onLoad,
  onRename,
}: {
  chatId: string | undefined
  /** Additional class names merged onto the sidebar root (e.g. a drawer-open modifier from `ChatView`). */
  className?: string
  conversations: ConversationSummary[]
  /**
   * Called after a conversation is loaded so the parent can dismiss the
   * mobile drawer. No-op on desktop, where the sidebar is always visible.
   */
  onClose?: () => void
  onDelete: (id: string) => void
  onLoad: (id: string) => void
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

  const handleLoad = useCallback(
    (id: string) => {
      onLoad(id)
      onClose?.()
    },
    [onLoad, onClose],
  )

  const rootClassName = className ? `chat-agent-sidebar ${className}` : 'chat-agent-sidebar'

  return (
    <div className={rootClassName}>
      <div className="chat-agent-sidebar__heading">Conversations</div>
      <div className="chat-agent-sidebar__search">
        <SearchIcon className="chat-agent-sidebar__search-icon" height={14} width={14} />
        <input
          aria-label="Search conversations"
          className="chat-agent-sidebar__search-input"
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          type="text"
          value={search}
        />
        {search ? (
          <div className="chat-agent-sidebar__search-clear">
            <Button
              aria-label="Clear search"
              buttonStyle="none"
              icon={['x']}
              iconStyle="none"
              margin={false}
              onClick={() => setSearch('')}
              size="xsmall"
            />
          </div>
        ) : null}
      </div>

      <div className="chat-agent-sidebar__list">
        {filteredConversations.length === 0 && search ? (
          <div className="chat-agent-sidebar__empty">No conversations found</div>
        ) : null}
        {filteredConversations.map((conv) => {
          const isActive = conv.id === chatId
          const isRenaming = conv.id === renamingId

          return (
            <div
              className={
                isActive
                  ? 'chat-agent-sidebar__item chat-agent-sidebar__item--active'
                  : 'chat-agent-sidebar__item'
              }
              key={conv.id}
              onClick={() => {
                if (!isRenaming) {
                  handleLoad(conv.id)
                }
              }}
              onDoubleClick={(e) => startRename(e, conv)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isRenaming) {
                  handleLoad(conv.id)
                }
              }}
              role="button"
              tabIndex={0}
            >
              {isRenaming ? (
                <input
                  aria-label="Rename conversation"
                  className="chat-agent-sidebar__rename-input"
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
                  type="text"
                  value={renameText}
                />
              ) : (
                <div className="chat-agent-sidebar__title">{conv.title}</div>
              )}
              {!isRenaming ? (
                <div className="chat-agent-sidebar__delete">
                  <Button
                    buttonStyle="icon-label"
                    icon="x"
                    iconStyle="without-border"
                    margin={false}
                    onClick={(e: React.MouseEvent) => handleDeleteClick(e, conv.id)}
                    size="xsmall"
                    tooltip="Delete conversation"
                  />
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
