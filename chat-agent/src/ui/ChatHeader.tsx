'use client'

import type { UIMessage } from 'ai'

import { Button } from '@payloadcms/ui'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

import type { AgentMode, MessageMetadata, ModelOption } from '../types.js'

import './ChatHeader.css'
import { formatTokens, sumTokens } from './format-tokens.js'
import { ChevronDownIcon } from './icons/ChevronDownIcon.js'
import { PencilIcon } from './icons/PencilIcon.js'
import { ModelSelector } from './ModelSelector.js'
import { MODE_LABELS, ModeSelector } from './ModeSelector.js'
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const settingsPanelId = useId()

  // Compact summary values: shown as label/value text on mobile so users can
  // see the current mode/model/tokens without the selectors taking 3 rows of
  // vertical space. Tapping the summary expands the same panel that always
  // renders on desktop.
  const modeLabel = MODE_LABELS[mode]
  const modelLabel =
    availableModels.find((m) => m.id === (selectedModel ?? defaultModel))?.label ??
    selectedModel ??
    defaultModel ??
    null
  const tokenTotal = sumTokens(messages)
  const showModeInSummary = availableModes.length > 1
  const showModelInSummary = availableModels.length > 1

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
      <div className="chat-agent-header__settings">
        <button
          aria-controls={settingsPanelId}
          aria-expanded={settingsOpen}
          aria-label={settingsOpen ? 'Hide settings' : 'Show settings'}
          className="chat-agent-header__summary"
          onClick={() => setSettingsOpen((v) => !v)}
          type="button"
        >
          {showModeInSummary && (
            <span className="chat-agent-header__summary-item">
              <span className="chat-agent-header__summary-label">Mode:</span> {modeLabel}
            </span>
          )}
          {showModelInSummary && modelLabel && (
            <span className="chat-agent-header__summary-item">
              <span className="chat-agent-header__summary-label">Model:</span> {modelLabel}
            </span>
          )}
          {tokenTotal > 0 && (
            <span className="chat-agent-header__summary-item">
              <span className="chat-agent-header__summary-label">Tokens:</span>{' '}
              {formatTokens(tokenTotal)}
            </span>
          )}
          <ChevronDownIcon className="chat-agent-header__summary-chevron" height={14} width={14} />
        </button>
        <div className="chat-agent-header__actions" id={settingsPanelId}>
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
    </div>
  )
}
