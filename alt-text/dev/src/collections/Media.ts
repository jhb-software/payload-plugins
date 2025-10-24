import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    // Configure image sizes for testing thumbnail generation
    imageSizes: [
      {
        name: 'sm',
        width: 400,
        height: 300,
        position: 'centre',
      },
      {
        name: 'md',
        width: 800,
        height: 600,
        position: 'centre',
      },
    ],
    mimeTypes: ['image/*'],
  },
  fields: [
    // The plugin will automatically inject context, alt, and keywords fields
    // Additional field for testing
    {
      name: 'title',
      type: 'text',
      localized: true,
    },
  ],
}
