'use client'

import { Button } from '@payloadcms/ui'
import { useCallback, useEffect, useRef, useState } from 'react'

import { StopIcon } from './icons/StopIcon.js'

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
      el.style.height = '42px'
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
      if (e.key === 'Enter' && e.shiftKey) {
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
        alignItems: 'flex-end',
        borderTop: '1px solid var(--theme-elevation-150)',
        display: 'flex',
        gap: '8px',
        marginTop: '16px',
        paddingTop: '12px',
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
        placeholder="Type a message… (Shift+Enter to send)"
        ref={textareaRef}
        rows={1}
        style={{
          background: 'var(--theme-input-bg, var(--theme-bg))',
          border: '1px solid var(--theme-elevation-150)',
          borderRadius: '8px',
          color: 'var(--theme-text)',
          flex: 1,
          fontFamily: 'inherit',
          fontSize: '14px',
          height: '42px',
          lineHeight: '1.5',
          maxHeight: '200px',
          outline: 'none',
          overflowY: 'auto',
          padding: '10px 12px',
          resize: 'none',
        }}
        value={input}
      />
      {isLoading ? (
        <Button
          buttonStyle="secondary"
          onClick={(e: React.MouseEvent) => {
            e.preventDefault()
            onStop?.()
          }}
          size="medium"
          type="button"
        >
          <StopIcon height="14" width="14" />
          Stop
        </Button>
      ) : (
        <Button disabled={!input.trim()} size="medium" type="submit">
          Send
        </Button>
      )}
    </form>
  )
}
