import type { CollectionConfig, CollectionSlug } from 'payload'

export const postsSchema: CollectionConfig = {
  slug: 'posts',
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'authors' as CollectionSlug,
      required: true,
    },
    {
      name: 'content',
      type: 'richText',
      required: false,
      localized: true,
    },
  ],
}
