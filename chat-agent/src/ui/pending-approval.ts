'use client'

/**
 * Detect whether the last assistant turn is waiting on the user to accept
 * or deny a tool-approval card. Used to gate the chat composer: sending a
 * new message while an approval is pending poisons the transcript with an
 * orphan `tool_use`, and the AI SDK starts every subsequent request with
 * `Tool result is missing for tool call toolu_...`.
 *
 * Only the last assistant message is inspected. A pending approval buried
 * in an earlier turn is corrupted state that belongs to the server-side
 * sanitizer, not the composer — the gate is there to protect the live
 * decision in front of the user.
 */

import type { UIMessage } from 'ai'

import { isToolUIPart } from 'ai'

export function hasPendingApproval(messages: UIMessage[]): boolean {
  const lastAssistant = findLastAssistant(messages)
  if (!lastAssistant) {
    return false
  }
  for (const part of lastAssistant.parts) {
    if (!isToolUIPart(part)) {
      continue
    }
    if ((part as { state?: unknown }).state === 'approval-requested') {
      return true
    }
  }
  return false
}

function findLastAssistant(messages: UIMessage[]): UIMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg && msg.role === 'assistant') {
      return msg
    }
  }
  return undefined
}
