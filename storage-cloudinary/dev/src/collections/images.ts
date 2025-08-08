import { CollectionConfig } from 'payload'

export const Images: CollectionConfig = {
  slug: 'images',
  labels: {
    singular: 'Image',
    plural: 'Images',
  },
  upload: {
    mimeTypes: ['image/*'],
  },
  fields: [
    // The other fields are automatically added by the plugin.
    {
      name: 'alt',
      type: 'text',
    },
  ],
}
