/**
 * Drop orphan tool-call / tool-result blocks from a `ModelMessage[]` list
 * before the request reaches the provider.
 *
 * The AI SDK's `convertToModelMessages({ ignoreIncompleteToolCalls: true })`
 * only strips UI tool parts whose state is `input-streaming` or
 * `input-available`. Stored conversations can still surface a tool-call
 * without a matching tool-result — or the mirror case — for reasons the
 * SDK doesn't handle:
 *
 *   - A usage-limit error (or tab close, or network blip) interrupts a
 *     tool run and the partial message is persisted with the tool part in
 *     a state the SDK filter misses.
 *   - The `@ai-sdk/anthropic` adapter drops `tool_result` blocks for
 *     output-error tools entirely — see vercel/ai#14259.
 *   - The same adapter forwards `undefined` input on aborted tool calls —
 *     see vercel/ai#14379.
 *   - A prior client-side prune stripped one half of the pair and saved
 *     the other.
 *
 * Anthropic rejects any request containing an orphan with:
 *
 *   messages.N: `tool_use` ids were found without `tool_result` blocks
 *   immediately after: toolu_... Each `tool_use` block must have a
 *   corresponding `tool_result` block in the next message
 *
 * Matches the shape of fix the AI SDK is adopting upstream in
 * `convertToLanguageModelPrompt` (vercel/ai#13828, #13578, #13214) and the
 * reverse-pass filter the Claude Code community recommends for the same
 * error class (anthropics/claude-code#6836).
 *
 * OpenAI reasoning adjacency (vercel/ai#8321): `reasoning` parts emitted
 * by o-series / reasoning models must stay adjacent to the tool-call they
 * were produced for. Dropping a tool-call while keeping the reasoning
 * that preceded it trips a different provider error, so this pass also
 * drops any `reasoning` parts that immediately precede a stripped
 * tool-call within the same assistant message.
 */

import type { ModelMessage } from 'ai'

interface ToolCallLike {
  toolCallId?: unknown
  type: string
}

function isToolCallPart(part: unknown): part is ToolCallLike {
  return (
    typeof part === 'object' && part !== null && (part as { type?: unknown }).type === 'tool-call'
  )
}

function isToolResultPart(part: unknown): part is ToolCallLike {
  return (
    typeof part === 'object' && part !== null && (part as { type?: unknown }).type === 'tool-result'
  )
}

function isReasoningPart(part: unknown): boolean {
  return (
    typeof part === 'object' && part !== null && (part as { type?: unknown }).type === 'reasoning'
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
    // Forward-walk so we can drop `reasoning` parts that precede a dropped
    // tool-call. Everything else goes through unchanged.
    const kept: unknown[] = []
    const pendingReasoning: unknown[] = []
    for (const part of msg.content as unknown[]) {
      if (isReasoningPart(part)) {
        pendingReasoning.push(part)
        continue
      }
      if (isToolCallPart(part) && typeof part.toolCallId === 'string') {
        if (toolResultIds.has(part.toolCallId)) {
          kept.push(...pendingReasoning, part)
        }
        // Dropped tool-call: also discard the reasoning paired with it.
        pendingReasoning.length = 0
        continue
      }
      if (isToolResultPart(part) && typeof part.toolCallId === 'string') {
        if (toolCallIds.has(part.toolCallId)) {
          kept.push(...pendingReasoning, part)
        }
        pendingReasoning.length = 0
        continue
      }
      kept.push(...pendingReasoning, part)
      pendingReasoning.length = 0
    }
    // Trailing reasoning (no tool-call follows in this message) is paired
    // with the message's own text response and stays.
    kept.push(...pendingReasoning)
    if (kept.length === 0) {
      continue
    }
    result.push({ ...msg, content: kept } as ModelMessage)
  }
  return result
}
