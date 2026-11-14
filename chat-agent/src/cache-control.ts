/**
 * Anthropic prompt-cache helpers. Anthropic builds cache prefixes in the
 * order `tools, system, messages`, so a marker on the system message caches
 * `tools + system` and a marker on a message content block caches everything
 * up to and including that block.
 *
 * Two breakpoints per request: one on the system message (covers tools +
 * system, reused across conversations) and one on the trailing message via
 * `prepareStep` (covers the per-turn growing history). `withTrailingCache`
 * strips earlier markers each step to stay at two breakpoints regardless of
 * how many tool-call rounds a turn accumulates. `providerOptions.anthropic`
 * is namespaced — non-Anthropic providers ignore it.
 */

import type { ModelMessage, SystemModelMessage } from 'ai'

const EPHEMERAL = { type: 'ephemeral' as const } as const

export function systemMessageWithCache(systemPrompt: string): SystemModelMessage {
  return {
    content: systemPrompt,
    providerOptions: { anthropic: { cacheControl: EPHEMERAL } },
    role: 'system',
  }
}

export function withTrailingCache(messages: ModelMessage[]): ModelMessage[] {
  if (messages.length === 0) {
    return messages
  }
  const lastIndex = messages.length - 1
  return messages.map((msg, i) => (i === lastIndex ? withCache(msg) : withoutCache(msg)))
}

function withCache(msg: ModelMessage): ModelMessage {
  return {
    ...msg,
    providerOptions: {
      ...msg.providerOptions,
      anthropic: {
        ...msg.providerOptions?.anthropic,
        cacheControl: EPHEMERAL,
      },
    },
  }
}

function withoutCache(msg: ModelMessage): ModelMessage {
  const anthropic = msg.providerOptions?.anthropic
  if (!anthropic || !('cacheControl' in anthropic)) {
    return msg
  }
  const { cacheControl: _drop, ...restAnthropic } = anthropic
  const { anthropic: _a, ...restProvider } = msg.providerOptions ?? {}
  const next: ModelMessage = { ...msg }
  if (Object.keys(restAnthropic).length > 0) {
    next.providerOptions = { ...restProvider, anthropic: restAnthropic }
  } else if (Object.keys(restProvider).length > 0) {
    next.providerOptions = restProvider
  } else {
    delete next.providerOptions
  }
  return next
}
