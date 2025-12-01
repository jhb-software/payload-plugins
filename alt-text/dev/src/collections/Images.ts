import type { CollectionConfig } from 'payload'

// This collection is the same as the Media collection but used to demonstrate the plugin with multiple upload collections.

export const Images: CollectionConfig = {
  slug: 'images',
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
