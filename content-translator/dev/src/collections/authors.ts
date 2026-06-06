import type { CollectionConfig } from 'payload'

export const authorsSchema: CollectionConfig = {
  slug: 'authors',
  admin: {
    useAsTitle: 'name',
  },
  versions: true,
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'bio',
      type: 'textarea',
      localized: true,
    },
  ],
}
