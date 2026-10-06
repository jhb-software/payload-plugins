import type { CollectionConfig } from 'payload'

/**
 * Images stored as Cloudinary `authenticated` assets. Cloudinary only delivers them through URLs
 * signed with the API secret, so they are served through Payload's access-controlled file route.
 */
export const PrivateImages: CollectionConfig = {
  slug: 'private-images',
  labels: {
    singular: 'Private Image',
    plural: 'Private Images',
  },
  access: {
    read: ({ req }) => Boolean(req.user),
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
