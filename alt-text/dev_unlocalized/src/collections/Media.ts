import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  upload: {
    mimeTypes: ['image/*'],
  },
  fields: [
    // The plugin will automatically inject context, alt, and keywords fields

    // For this example project which has no real upload storage connected to, always use the following image URL:
    {
      name: 'url',
      type: 'text',
      admin: {
        hidden: true,
      },
      hooks: {
        afterRead: [
          async () => 'https://images.pexels.com/photos/16981245/pexels-photo-16981245.jpeg',
        ],
      },
    },
  ],
}
