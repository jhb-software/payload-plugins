import type { Config, SanitizedConfig } from 'payload'

import type { Geocoder } from './geocoder/types.js'

import { PLUGIN_SLUG } from './constants.js'

/** What the plugin stores in `config.custom` (server-only) for its hooks, endpoint and field. */
export type PluginCustom = {
  geocoder?: Geocoder
  googleMapsApiKey?: string
}

export function getPluginCustom(config: Config | SanitizedConfig): PluginCustom | undefined {
  const value: unknown = config.custom?.[PLUGIN_SLUG]
  return value && typeof value === 'object' ? value : undefined
}
