import { CollectionConfig } from 'payload'

export const Videos: CollectionConfig = {
  slug: 'videos',
  labels: {
    singular: 'Video',
    plural: 'Videos',
  },
  upload: {
    mimeTypes: ['video/*'],
  },
  fields: [
    // The other fields are automatically added by the plugin.
    {
      name: 'description',
      type: 'textarea',
    },
  ],
}
