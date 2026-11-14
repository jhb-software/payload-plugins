import type { Tool } from 'ai'

import { describe, expect, it } from 'vitest'

import { applyToolDiscovery, SEARCH_TOOL_KEY } from './tool-discovery.js'

const fakeSearchTool = { type: 'tool_search_tool_bm25_20251119' } as unknown as Tool

function makeTool(name: string, providerOptions?: Record<string, unknown>): Tool {
  return {
    description: `${name} tool`,
    execute: () => Promise.resolve({ name }),
    inputSchema: { type: 'object' as const },
    ...(providerOptions && { providerOptions }),
  } as unknown as Tool
}

describe('applyToolDiscovery', () => {
  it('returns the toolset unchanged when toolDiscovery is undefined', () => {
    const tools = { find: makeTool('find'), update: makeTool('update') }
    expect(applyToolDiscovery(tools, undefined, 'claude-haiku-4-5-20251001')).toBe(tools)
  })

  it('returns the toolset unchanged when the model is not Anthropic', () => {
    const tools = { find: makeTool('find'), update: makeTool('update') }
    const result = applyToolDiscovery(tools, { searchTool: fakeSearchTool }, 'gpt-4o')
    expect(result).toBe(tools)
    expect(result).not.toHaveProperty(SEARCH_TOOL_KEY)
  })

  it('marks non-eager tools with anthropic.deferLoading and adds the search tool', () => {
    const tools = {
      count: makeTool('count'),
      delete: makeTool('delete'),
      find: makeTool('find'),
      listBlocks: makeTool('listBlocks'),
      update: makeTool('update'),
    }
    const result = applyToolDiscovery(
      tools,
      { searchTool: fakeSearchTool },
      'claude-haiku-4-5-20251001',
    )

    // Defaults: find + count stay eager; update / delete / listBlocks deferred.
    expect(getDeferLoading(result.find)).toBeUndefined()
    expect(getDeferLoading(result.count)).toBeUndefined()
    expect(getDeferLoading(result.update)).toBe(true)
    expect(getDeferLoading(result.delete)).toBe(true)
    expect(getDeferLoading(result.listBlocks)).toBe(true)

    expect(result[SEARCH_TOOL_KEY]).toBe(fakeSearchTool)
  })

  it('respects a custom eager list', () => {
    const tools = {
      find: makeTool('find'),
      update: makeTool('update'),
    }
    const result = applyToolDiscovery(
      tools,
      { eager: ['update'], searchTool: fakeSearchTool },
      'claude-haiku-4-5-20251001',
    )
    // 'find' is no longer in eager → gets deferred; 'update' is now eager.
    expect(getDeferLoading(result.find)).toBe(true)
    expect(getDeferLoading(result.update)).toBeUndefined()
  })

  it('preserves existing providerOptions when adding deferLoading', () => {
    const tool = makeTool('update', {
      anthropic: { cacheControl: { type: 'ephemeral' } },
      openai: { someOption: 'kept' },
    })
    const result = applyToolDiscovery(
      { update: tool },
      { searchTool: fakeSearchTool },
      'claude-haiku-4-5-20251001',
    )
    const wrapped = result.update as { providerOptions: Record<string, Record<string, unknown>> }
    expect(wrapped.providerOptions.anthropic).toEqual({
      cacheControl: { type: 'ephemeral' },
      deferLoading: true,
    })
    expect(wrapped.providerOptions.openai).toEqual({ someOption: 'kept' })
  })

  it('does not mutate the original tool objects', () => {
    const tools = { update: makeTool('update') }
    applyToolDiscovery(tools, { searchTool: fakeSearchTool }, 'claude-haiku-4-5-20251001')
    expect((tools.update as { providerOptions?: unknown }).providerOptions).toBeUndefined()
  })
})

function getDeferLoading(tool: Tool | undefined): boolean | undefined {
  const opts = (tool as { providerOptions?: Record<string, Record<string, unknown>> } | undefined)
    ?.providerOptions
  return opts?.anthropic?.deferLoading as boolean | undefined
}
