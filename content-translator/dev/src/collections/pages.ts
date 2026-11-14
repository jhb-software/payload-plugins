import type { PageCollectionConfig } from '@jhb.software/payload-pages-plugin'

/**
 * A page collection managed by the Pages plugin: the `slug`, `path` and
 * `breadcrumbs` fields are injected by `payloadPagesPlugin` — the app never
 * declares them. `makeSlugTranslatable` in the payload config attaches the
 * content-translator handling to the injected slug field.
 */
export const pagesSchema: PageCollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'title',
  },
  page: {
    parent: {
      collection: 'pages',
      name: 'parent',
    },
    isRootCollection: true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'content',
      type: 'richText',
      localized: true,
    },
  ],
}
