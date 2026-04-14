'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { SendIcon } from './icons/SendIcon.js'
import { StopIcon } from './icons/StopIcon.js'

const iconButtonStyle = (enabled: boolean): React.CSSProperties => ({
  alignItems: 'center',
  background: enabled ? 'var(--theme-text)' : 'var(--theme-elevation-150)',
  border: 'none',
  borderRadius: '8px',
  color: enabled ? 'var(--theme-bg)' : 'var(--theme-elevation-500)',
  cursor: enabled ? 'pointer' : 'not-allowed',
  display: 'inline-flex',
  flexShrink: 0,
  height: '32px',
  justifyContent: 'center',
  padding: 0,
  transition: 'background 0.15s ease',
  width: '32px',
})

const visuallyHidden: React.CSSProperties = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: '1px',
  margin: '-1px',
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  width: '1px',
}

export function ChatInput({
  isLoading,
  onSend,
  onStop,
}: {
  isLoading: boolean
  onSend: (text: string) => void
  onStop?: () => void
}) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!isLoading) {
      textareaRef.current?.focus()
    }
  }, [isLoading])

  const resetHeight = useCallback(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
    }
  }, [])

  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`
    }
  }, [])

  const handleSend = useCallback(() => {
    if (input.trim() && !isLoading) {
      onSend(input)
      setInput('')
      resetHeight()
    }
  }, [input, isLoading, onSend, resetHeight])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        handleSend()
      }}
      style={{
        borderTop: '1px solid var(--theme-elevation-150)',
        marginTop: '16px',
        paddingTop: '12px',
      }}
    >
      <div
        style={{
          background: 'var(--theme-input-bg, var(--theme-bg))',
          border: '1px solid var(--theme-elevation-150)',
          borderRadius: '8px',
          position: 'relative',
        }}
      >
        <textarea
          aria-label="Chat message"
          disabled={isLoading}
          onChange={(e) => {
            setInput(e.target.value)
            autoResize()
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          ref={textareaRef}
          rows={2}
          style={{
            background: 'transparent',
            border: 'none',
            boxSizing: 'border-box',
            color: 'var(--theme-text)',
            display: 'block',
            fontFamily: 'inherit',
            fontSize: '14px',
            lineHeight: '1.5',
            maxHeight: '200px',
            minHeight: '62px',
            outline: 'none',
            overflowY: 'auto',
            padding: '10px 52px 10px 12px',
            resize: 'none',
            width: '100%',
          }}
          value={input}
        />
        <div style={{ bottom: '8px', position: 'absolute', right: '8px' }}>
          {isLoading ? (
            <button
              aria-label="Stop"
              onClick={(e) => {
                e.preventDefault()
                onStop?.()
              }}
              style={iconButtonStyle(true)}
              title="Stop generating"
              type="button"
            >
              <StopIcon height="16" width="16" />
              <span style={visuallyHidden}>Stop</span>
            </button>
          ) : (
            <button
              aria-label="Send message"
              disabled={!input.trim()}
              style={iconButtonStyle(input.trim().length > 0)}
              title="Send message"
              type="submit"
            >
              <SendIcon height="16" width="16" />
            </button>
          )}
        </div>
      </div>
    </form>
  )
}
