import { CollectionConfig } from 'payload'

/**
 * Images that Payload re-encodes (to WebP) before storing. For client uploads this means the
 * browser uploads the original to Cloudinary, and the server then replaces it with the processed
 * version.
 */
export const ProcessedImages: CollectionConfig = {
  slug: 'processed-images',
  labels: {
    singular: 'Processed Image',
    plural: 'Processed Images',
  },
  upload: {
    mimeTypes: ['image/*'],
    formatOptions: {
      format: 'webp',
    },
  },
  fields: [
    // The other fields are automatically added by the plugin.
    {
      name: 'alt',
      type: 'text',
    },
  ],
}
