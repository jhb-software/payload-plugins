/**
 * Typed accessors for the chat-agent plugin's blob inside Payload's
 * `config.custom`. The plugin writes its runtime-needed options under
 * `config.custom.chatAgent` at startup so handlers and helpers (admin views,
 * `runAgent`, the access guard) can read them later without re-threading the
 * raw `options` object through closures.
 */

import type { Payload } from 'payload'

import type { PluginAccessFn } from './access.js'
import type { ChatAgentPluginOptions, ModelOption, ModesConfig } from './types.js'

/** Shape the plugin writes into `payload.config.custom.chatAgent`. */
export interface ChatAgentPluginCustomConfig {
  access?: PluginAccessFn
  availableModels?: ModelOption[]
  defaultModel?: string
  modesConfig?: ModesConfig
  pluginOptions?: ChatAgentPluginOptions
  suggestedPrompts?: string[]
}

export function getPluginCustomConfig(
  payload: Payload | undefined,
): ChatAgentPluginCustomConfig | undefined {
  return (payload?.config as { custom?: { chatAgent?: ChatAgentPluginCustomConfig } } | undefined)
    ?.custom?.chatAgent
}

export function getPluginOptions(payload: Payload | undefined): ChatAgentPluginOptions | undefined {
  return getPluginCustomConfig(payload)?.pluginOptions
}
