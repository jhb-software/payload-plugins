import { formatSlug } from '@jhb.software/payload-pages-plugin'
import type { Config } from 'payload'

/**
 * Makes the Pages plugin's injected `slug` field translator-aware: a config
 * plugin that runs after `payloadPagesPlugin` and attaches the
 * `content-translator` namespace to the already-injected slug field.
 *
 * Derives the slug from the translated title (`skip: true` + `afterTranslate`)
 * and normalizes it with `formatSlug` — the same rule the slug field validates
 * against — so the derived value is always accepted on save.
 */
export const makeSlugTranslatable =
  (collectionSlugs: string[]) =>
  (config: Config): Config => ({
    ...config,
    collections: config.collections?.map((collection) =>
      collectionSlugs.includes(collection.slug)
        ? {
            ...collection,
            fields: collection.fields.map((field) =>
              'name' in field && field.name === 'slug'
                ? {
                    ...field,
                    custom: {
                      ...field.custom,
                      'content-translator': {
                        skip: true,
                        afterTranslate: ({
                          siblingData,
                        }: {
                          siblingData: Record<string, unknown>
                        }) => formatSlug(String(siblingData.title ?? '')),
                      },
                    },
                  }
                : field,
            ),
          }
        : collection,
    ),
  })
