'use client'

import type { UIMessage } from 'ai'

import { Button } from '@payloadcms/ui'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { AgentMode, MessageMetadata, ModelOption } from '../types.js'

import './ChatHeader.css'
import { PencilIcon } from './icons/PencilIcon.js'
import { ModelSelector } from './ModelSelector.js'
import { ModeSelector } from './ModeSelector.js'
import { TokenBadge } from './TokenBadge.js'

const FALLBACK_TITLE = 'New conversation'

export interface ChatHeaderProps {
  availableModels: ModelOption[]
  availableModes: AgentMode[]
  canRename: boolean
  defaultModel?: string
  disabled?: boolean
  messages: UIMessage<MessageMetadata>[]
  mode: AgentMode
  onModeChange: (mode: AgentMode) => void
  onModelChange: (modelId: string) => void
  onRename: (title: string) => void
  selectedModel?: string
  title: string
}

export function ChatHeader({
  availableModels,
  availableModes,
  canRename,
  defaultModel,
  disabled,
  messages,
  mode,
  onModeChange,
  onModelChange,
  onRename,
  selectedModel,
  title,
}: ChatHeaderProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  const startRename = useCallback(() => {
    if (!canRename) {
      return
    }
    setDraft(title)
    setIsEditing(true)
  }, [canRename, title])

  const commit = useCallback(() => {
    const trimmed = draft.trim()
    onRename(trimmed || FALLBACK_TITLE)
    setIsEditing(false)
  }, [draft, onRename])

  const cancel = useCallback(() => {
    setIsEditing(false)
  }, [])

  return (
    <div className="chat-agent-header">
      <div className="chat-agent-header__title-group">
        {isEditing ? (
          <input
            aria-label="Rename conversation"
            className="chat-agent-header__rename-input"
            onBlur={commit}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commit()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                cancel()
              }
            }}
            ref={inputRef}
            type="text"
            value={draft}
          />
        ) : (
          <>
            <h1 className="chat-agent-header__title">{title}</h1>
            <Button
              aria-label="Rename conversation"
              buttonStyle="none"
              disabled={!canRename}
              margin={false}
              onClick={startRename}
              size="xsmall"
              tooltip="Rename"
            >
              <PencilIcon height={14} style={{ color: 'var(--theme-elevation-400)' }} width={14} />
            </Button>
          </>
        )}
      </div>
      <div className="chat-agent-header__actions">
        <ModeSelector
          availableModes={availableModes}
          disabled={disabled}
          mode={mode}
          onModeChange={onModeChange}
        />
        {availableModels.length > 1 && (
          <ModelSelector
            available={availableModels}
            disabled={disabled}
            onChange={onModelChange}
            value={selectedModel ?? defaultModel ?? ''}
          />
        )}
        <TokenBadge messages={messages} />
      </div>
    </div>
  )
}
