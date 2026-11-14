'use client'

import { Button } from '@payloadcms/ui'
import { useCallback, useState } from 'react'

import { CheckIcon } from './icons/CheckIcon.js'
import { ClipboardIcon } from './icons/ClipboardIcon.js'

export function CodeBlock({ children, language }: { children: string; language?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [children])

  return (
    <div
      style={{
        borderRadius: '8px',
        marginBottom: '4px',
        marginTop: '4px',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {language ? (
        <div
          style={{
            background: 'var(--theme-elevation-900)',
            borderBottom: '1px solid var(--theme-elevation-700)',
            color: 'var(--theme-elevation-400)',
            display: 'flex',
            fontSize: '11px',
            justifyContent: 'space-between',
            padding: '4px 12px',
          }}
        >
          <span>{language}</span>
          <Button
            aria-label={copied ? 'Copied' : 'Copy code'}
            buttonStyle="none"
            margin={false}
            onClick={handleCopy}
            size="xsmall"
            tooltip={copied ? 'Copied!' : 'Copy code'}
          >
            {copied ? (
              <CheckIcon height={12} width={12} />
            ) : (
              <ClipboardIcon height={12} width={12} />
            )}
          </Button>
        </div>
      ) : null}
      <div style={{ position: 'relative' }}>
        {!language ? (
          <div style={{ position: 'absolute', right: '4px', top: '4px' }}>
            <Button
              aria-label={copied ? 'Copied' : 'Copy code'}
              buttonStyle="none"
              margin={false}
              onClick={handleCopy}
              size="xsmall"
              tooltip={copied ? 'Copied!' : 'Copy code'}
            >
              {copied ? (
                <CheckIcon height={12} width={12} />
              ) : (
                <ClipboardIcon height={12} width={12} />
              )}
            </Button>
          </div>
        ) : null}
        <pre
          style={{
            background: 'var(--theme-elevation-900)',
            color: 'var(--theme-bg)',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '13px',
            lineHeight: '1.5',
            margin: 0,
            overflowX: 'auto',
            padding: '12px',
          }}
        >
          <code>{children}</code>
        </pre>
      </div>
    </div>
  )
}
