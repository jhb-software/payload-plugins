'use client'

import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import './MarkdownContent.css'

export function MarkdownContent({ children }: { children: string }) {
  return (
    <div className="chat-agent-markdown">
      <Markdown remarkPlugins={[remarkGfm]}>{children}</Markdown>
    </div>
  )
}
