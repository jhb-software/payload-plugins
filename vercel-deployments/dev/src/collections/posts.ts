import type { CollectionConfig } from 'payload'

/** Tenant-scoped content, so the admin panel has a reason to show the tenant selector. */
export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
  ],
}
