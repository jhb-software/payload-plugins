import { CollectionConfig } from 'payload'

/**
 * SVG images. Payload only accepts SVG and XML uploads for collections that opt into restricted
 * file types, and serves them with a restrictive Content-Security-Policy.
 */
export const VectorImages: CollectionConfig = {
  slug: 'vector-images',
  labels: {
    singular: 'Vector Image',
    plural: 'Vector Images',
  },
  upload: {
    allowRestrictedFileTypes: true,
    mimeTypes: ['image/svg+xml'],
  },
  fields: [
    // The other fields are automatically added by the plugin.
    {
      name: 'alt',
      type: 'text',
    },
  ],
}
