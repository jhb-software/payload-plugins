import type { CollectionSlug, GlobalSlug } from 'payload'

import type { TranslateResolver } from './resolvers/types.js'
import type { TranslateAccess } from './translate/types.js'

export type TranslatorConfig = {
  /**
   * Custom access control for the translate endpoint. Receives the request and
   * the parsed args (`update`, `collectionSlug`, `locale`, …), so access can be
   * decided per request — e.g. allow returning translations to any user but
   * restrict persisting (`update: true`) to a role. Return `true` to allow,
   * `false` to deny.
   *
   * Treat the args as untrusted: grant on `req.user`, restrict on the args.
   *
   * @default ({ req }) => !!req.user — requires authentication
   */
  access?: TranslateAccess

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
