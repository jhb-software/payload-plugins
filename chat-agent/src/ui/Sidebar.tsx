'use client'

import { Button } from '@payloadcms/ui'
import React, { useCallback } from 'react'

import './Sidebar.css'

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
}: {
  chatId: string | undefined
  conversations: ConversationSummary[]
  onDelete: (id: string) => void
  onLoad: (id: string) => void
  onNew: () => void
}) {
  const handleDeleteClick = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation()
      if (window.confirm('Delete this conversation?')) {
        onDelete(id)
      }
    },
    [onDelete],
  )

  return (
    <div className="chat-agent-sidebar">
      <div className="chat-agent-sidebar__new">
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
      <div className="chat-agent-sidebar__list">
        {conversations.map((conv) => {
          const isActive = conv.id === chatId
          return (
            <div
              className={
                isActive
                  ? 'chat-agent-sidebar__item chat-agent-sidebar__item--active'
                  : 'chat-agent-sidebar__item'
              }
              key={conv.id}
              onClick={() => onLoad(conv.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onLoad(conv.id)
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className="chat-agent-sidebar__title">{conv.title}</div>
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
