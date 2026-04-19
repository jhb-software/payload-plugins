/**
 * Drop orphan tool-call / tool-result blocks from a `ModelMessage[]` list
 * before the request reaches the provider.
 *
 * The AI SDK's `convertToModelMessages({ ignoreIncompleteToolCalls: true })`
 * only strips UI tool parts whose state is `input-streaming` or
 * `input-available`. Stored conversations can still surface a tool-call
 * without a matching tool-result — or the mirror case — when a previous
 * turn was interrupted mid-run (usage-limit during tool execution, the tab
 * closed, a serialization edge, a client-side prune that removed one half
 * of the pair). Anthropic in particular rejects such a request with:
 *
 *   messages.N: `tool_use` ids were found without `tool_result` blocks
 *   immediately after: toolu_... Each `tool_use` block must have a
 *   corresponding `tool_result` block in the next message
 *
 * This pass runs over the converted messages and keeps only tool-call /
 * tool-result parts whose `toolCallId` appears on *both* sides of the
 * conversation. Messages whose content becomes empty after filtering are
 * removed so we don't hand the provider an empty assistant or tool turn.
 *
 * Tool-approval-request / tool-approval-response parts use `approvalId`
 * for pairing, not `toolCallId`, and are left untouched.
 */

import type { ModelMessage } from 'ai'

interface ToolCallLike {
  toolCallId?: unknown
  type: string
}

function isToolCallPart(part: unknown): part is ToolCallLike {
  return (
    typeof part === 'object' &&
    part !== null &&
    (part as { type?: unknown }).type === 'tool-call'
  )
}

function isToolResultPart(part: unknown): part is ToolCallLike {
  return (
    typeof part === 'object' &&
    part !== null &&
    (part as { type?: unknown }).type === 'tool-result'
  )
}

export function sanitizeOrphanToolCalls(messages: ModelMessage[]): ModelMessage[] {
  const toolCallIds = new Set<string>()
  const toolResultIds = new Set<string>()

  for (const msg of messages) {
    if (!Array.isArray(msg.content)) {
      continue
    }
    for (const part of msg.content) {
      if (isToolCallPart(part) && typeof part.toolCallId === 'string') {
        toolCallIds.add(part.toolCallId)
      } else if (isToolResultPart(part) && typeof part.toolCallId === 'string') {
        toolResultIds.add(part.toolCallId)
      }
    }
  }

  const result: ModelMessage[] = []
  for (const msg of messages) {
    if (!Array.isArray(msg.content)) {
      result.push(msg)
      continue
    }
    const filtered = (msg.content as unknown[]).filter((part) => {
      if (isToolCallPart(part) && typeof part.toolCallId === 'string') {
        return toolResultIds.has(part.toolCallId)
      }
      if (isToolResultPart(part) && typeof part.toolCallId === 'string') {
        return toolCallIds.has(part.toolCallId)
      }
      return true
    })
    if (filtered.length === 0) {
      continue
    }
    result.push({ ...msg, content: filtered } as ModelMessage)
  }
  return result
}
