import type { CollectionConfig, Config } from 'payload'

import type { IncomingPageCollectionConfig } from './types/PageCollectionConfig.js'
import type { PagesPluginConfig } from './types/PagesPluginConfig.js'
import type { IncomingRedirectsCollectionConfig } from './types/RedirectsCollectionConfig.js'

import { createPageCollectionConfig } from './collections/PageCollectionConfig.js'
import { createRedirectsCollectionConfig } from './collections/RedirectsCollectionConfig.js'
import { translations } from './translations/index.js'
import { deepMergeSimple } from './utils/deepMergeSimple.js'
import { isPageCollectionConfig } from './utils/pageCollectionConfigHelpers.js'
import { parentCollections } from './utils/parentRef.js'

/** Payload plugin which integrates fields for managing website pages. */
export const payloadPagesPlugin =
  (pluginOptions: PagesPluginConfig) =>
  (incomingConfig: Config): Config => {
    const config = { ...incomingConfig }

    // If the plugin is disabled, return the config without modifying it
    if (pluginOptions.enabled === false) {
      return config
    }

    config.onInit = async (payload) => {
      if (incomingConfig.onInit) {
        await incomingConfig.onInit(payload)
      }
    }

    // Ensure collections array exists
    config.collections = config.collections || []

    // Find and transform collections
    config.collections = config.collections.map((collection) => {
      if ('page' in collection) {
        // Create page collection using the page configuration
        return createPageCollectionConfig({
          collectionConfig: collection as IncomingPageCollectionConfig,
          pluginConfig: pluginOptions,
        })
      } else if ('redirects' in collection) {
        // Create redirects collection using the redirects configuration
        return createRedirectsCollectionConfig({
          collectionConfig: collection as IncomingRedirectsCollectionConfig,
          pluginConfig: pluginOptions,
        })
      }
      return collection
    })

    validateParentCollections(config.collections)

    return {
      ...config,
      i18n: {
        ...config.i18n,
        translations: deepMergeSimple(translations, incomingConfig.i18n?.translations ?? {}),
      },
    }
  }

/**
 * Rejects parent configurations that cannot produce a valid page tree, at init rather than at
 * request time.
 *
 * Without this, a `parent.collection` naming a collection that is not a page collection boots
 * fine and fails much later with a breadcrumb error that does not point at the config.
 */
function validateParentCollections(collections: CollectionConfig[]): void {
  const pageCollectionSlugs = new Set(
    collections.filter(isPageCollectionConfig).map((collection) => collection.slug),
  )

  for (const collection of collections) {
    if (!isPageCollectionConfig(collection)) {
      continue
    }

    const slugs: string[] = parentCollections(collection.page)

    for (const slug of slugs) {
      if (!pageCollectionSlugs.has(slug)) {
        throw new Error(
          `[Pages Plugin] The collection "${collection.slug}" declares "${slug}" as a parent collection, but "${slug}" is not a page collection. Every slug in \`page.parent.collection\` must name a collection which itself has a \`page\` config.`,
        )
      }
    }

    // A shared parent document and a nestable tree are contradictory: the parent field copies
    // its default from the first document in the collection, so every new document would
    // inherit an arbitrary sibling's parent instead of being placed in the tree.
    if (collection.page.parent.sharedDocument && slugs.includes(collection.slug)) {
      throw new Error(
        `[Pages Plugin] The collection "${collection.slug}" sets \`page.parent.sharedDocument\`, so it cannot list its own slug in \`page.parent.collection\`. Either drop "${collection.slug}" from the list or disable \`sharedDocument\`.`,
      )
    }
  }
}
