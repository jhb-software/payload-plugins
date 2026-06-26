import type { CollectionConfig } from 'payload'

/** Upload collection — targets for `upload` nodes in rich text. */
export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    // Public read so the Astro app can resolve image URLs over the REST API.
    read: () => true,
  },
  upload: {
    // SVG keeps the seed dependency-free (no sharp/raster processing needed).
    mimeTypes: ['image/*'],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
    },
  ],
}
