'use client'

import { Button } from '@payloadcms/ui'
import { useEffect, useRef, useState } from 'react'

export function ChatInput({
  disabled,
  isLoading,
  onSend,
}: {
  disabled?: boolean
  isLoading: boolean
  onSend: (text: string) => void
}) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const isDisabled = disabled ?? isLoading

  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus()
    }
  }, [isLoading])

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (input.trim() && !isDisabled) {
          onSend(input)
          setInput('')
        }
      }}
      style={{
        borderTop: '1px solid var(--theme-elevation-150)',
        display: 'flex',
        gap: '8px',
        marginTop: '16px',
        paddingTop: '12px',
      }}
    >
      <input
        disabled={isDisabled}
        onChange={(e) => setInput(e.target.value)}
        placeholder={isDisabled && !isLoading ? 'Token budget exceeded' : 'Type a message\u2026'}
        ref={inputRef}
        style={{
          background: 'var(--theme-input-bg, var(--theme-bg))',
          border: '1px solid var(--theme-elevation-150)',
          borderRadius: '8px',
          color: 'var(--theme-text)',
          flex: 1,
          fontSize: '14px',
          outline: 'none',
          padding: '10px 12px',
        }}
        type="text"
        value={input}
      />
      <Button disabled={!input.trim() || isDisabled} size="medium" type="submit">
        {isLoading ? 'Sending\u2026' : 'Send'}
      </Button>
    </form>
  )
}
