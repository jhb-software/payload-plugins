import type { CollectionSlug, GlobalSlug } from 'payload'

import type { TranslateResolver } from './resolvers/types.js'

export type TranslatorConfig = {
  /**
   * Collections with the enabled translator in the admin UI
   */
  collections: CollectionSlug[]
  /**
   * Enable the plugin.
   * @default true
   */
  enabled?: boolean
  /**
   * Globals with the enabled translator in the admin UI
   */
  globals: GlobalSlug[]
  /**
   * The translation resolver/service to use (e.g., openAIResolver)
   */
  resolver: TranslateResolver
}

/**
 * Shape of translator custom config stored on admin.custom and config.custom
 */
export type TranslatorCustomConfig = {
  translator?: {
    resolver: TranslateResolver
  }
}

/**
 * Client-safe shape of translator config (only includes key)
 */
export type TranslatorClientConfig = {
  translator?: {
    resolver: { key: string }
  }
}
