import type { CollectionConfig } from 'payload'

/**
 * Minimal page collection — a target for internal `link` nodes. The `path`
 * field is what the Astro app's `resolveInternalLink` turns into an href.
 */
export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'title',
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'path',
      type: 'text',
      required: true,
    },
  ],
}
