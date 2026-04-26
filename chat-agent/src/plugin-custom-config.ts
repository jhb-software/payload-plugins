/**
 * Typed accessors for the chat-agent plugin's blob inside Payload's
 * `config.custom`. The plugin writes its runtime-needed options under
 * `config.custom.chatAgent` at startup so handlers and helpers (admin views,
 * `runAgent`, the access guard) can read them later without re-threading the
 * raw `options` object through closures.
 */

import type { Payload } from 'payload'

import type { ChatAgentPluginOptions, ModesConfig } from './types.js'

/**
 * Shape the plugin writes into `payload.config.custom.chatAgent`.
 *
 * Only `modesConfig` and `pluginOptions` live here — `modesConfig` because it's
 * the *resolved* form of `options.modes` (not the raw input), `pluginOptions`
 * because it's the full options blob that handlers and `runAgent` read fields
 * off of (`access`, `model`, `tools`, `availableModels`, etc.) without
 * re-threading the raw `options` argument through closures.
 */
export interface ChatAgentPluginCustomConfig {
  modesConfig?: ModesConfig
  pluginOptions?: ChatAgentPluginOptions
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
