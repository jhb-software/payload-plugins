import type { CollectionConfig } from 'payload'

export const Redirects: CollectionConfig = {
  slug: 'redirects',
  admin: {
    defaultColumns: ['sourcePath', 'destinationPath', 'permanent', 'createdAt'],
    listSearchableFields: ['sourcePath', 'destinationPath'],
  },
  custom: {
    pagesPlugin: {
      redirects: {},
    },
  },
  fields: [
    // the fields are added by the plugin automatically
  ],
}
