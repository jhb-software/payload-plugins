'use client'

import { Button } from '@payloadcms/ui'
import React, { useCallback } from 'react'

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
        {conversations.map((conv) => {
          const isActive = conv.id === chatId
          return (
            <div
              key={conv.id}
              onClick={() => onLoad(conv.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
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
                cursor: 'pointer',
                display: 'flex',
                fontSize: '13px',
                fontWeight: isActive ? 600 : 400,
                gap: '4px',
                padding: '8px 10px',
              }}
              tabIndex={0}
            >
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
              <Button
                buttonStyle="icon-label"
                icon="x"
                onClick={(e: React.MouseEvent) => handleDeleteClick(e, conv.id)}
                round
                size="small"
                tooltip="Delete conversation"
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
