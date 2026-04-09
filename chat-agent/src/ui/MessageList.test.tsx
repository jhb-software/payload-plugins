// @vitest-environment jsdom
import type { UIMessage } from 'ai'

import { cleanup, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import type { MessageMetadata } from '../types.js'

import { MessageList } from './MessageList.js'

describe('MessageList', () => {
  afterEach(cleanup)

  it('shows empty state placeholder when there are no messages, hides it otherwise', () => {
    const ref = createRef<HTMLDivElement>()
    const { unmount } = render(<MessageList messages={[]} scrollRef={ref} />)
    expect(screen.getByText(/ask me anything/i)).toBeDefined()
    unmount()

    const message = {
      id: '1',
      parts: [{ text: 'Hi', type: 'text' as const }],
      role: 'user',
    } as UIMessage<MessageMetadata>
    render(<MessageList messages={[message]} scrollRef={ref} />)
    expect(screen.queryByText(/ask me anything/i)).toBeNull()
    expect(screen.getByText('Hi')).toBeDefined()
  })
})
