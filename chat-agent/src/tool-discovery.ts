import type { Tool } from 'ai'

import type { ToolDiscoveryConfig } from './types.js'

/** Read-paths that show up in nearly every chat-agent flow. */
export const DEFAULT_EAGER_TOOLS = [
  'find',
  'findByID',
  'count',
  'findGlobal',
  'getCollectionSchema',
] as const

/** Underscore-prefix avoids colliding with user-defined or built-in tool names. */
export const SEARCH_TOOL_KEY = '_chatAgentToolSearch'

/**
 * Gating on `startsWith('claude-')` because the plugin is provider-agnostic
 * and can't import `@ai-sdk/anthropic` to do a stricter check.
 */
export function isAnthropicModel(modelId: string): boolean {
  return modelId.startsWith('claude-')
}

/** Merges into existing providerOptions so user-defined tool options are preserved. */
function withDeferLoading<T extends Tool>(tool: T): T {
  const existing = (tool as { providerOptions?: Record<string, unknown> }).providerOptions ?? {}
  const existingAnthropic =
    typeof existing.anthropic === 'object' && existing.anthropic !== null
      ? (existing.anthropic as Record<string, unknown>)
      : {}
  return {
    ...tool,
    providerOptions: {
      ...existing,
      anthropic: {
        ...existingAnthropic,
        deferLoading: true,
      },
    },
  }
}

export function applyToolDiscovery<T extends Tool>(
  tools: Record<string, T>,
  config: ToolDiscoveryConfig | undefined,
  modelId: string,
): Record<string, T> {
  if (!config || !isAnthropicModel(modelId)) {
    return tools
  }
  const eager = new Set(config.eager ?? DEFAULT_EAGER_TOOLS)
  const result: Record<string, T> = {}
  for (const [name, tool] of Object.entries(tools)) {
    result[name] = eager.has(name) ? tool : withDeferLoading(tool)
  }
  result[SEARCH_TOOL_KEY] = config.searchTool as T
  return result
}
