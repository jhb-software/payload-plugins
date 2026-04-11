'use client'

import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import './MarkdownContent.css'

/**
 * Open every markdown link in a new tab so clicking on an admin panel
 * link (e.g. to a document the agent just created) doesn't navigate the
 * user away from the chat view and lose conversation state.
 */
const markdownComponents = {
  a: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  ),
}

export function MarkdownContent({ children }: { children: string }) {
  return (
    <div className="chat-agent-markdown">
      <Markdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
        {children}
      </Markdown>
    </div>
  )
}
