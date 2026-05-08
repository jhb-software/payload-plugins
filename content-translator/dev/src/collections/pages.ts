import type { CollectionConfig } from 'payload'

export const pagesSchema: CollectionConfig = {
  slug: 'pages',
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
      name: 'content',
      type: 'richText',
      required: false,
      localized: true,
    },
    {
      name: 'meta',
      type: 'group',
      fields: [
        {
          name: 'title',
          type: 'text',
          localized: true,
        },
        {
          name: 'description',
          type: 'textarea',
          localized: true,
        },
      ],
    },
    {
      type: 'tabs',
      tabs: [
        {
          name: 'seo',
          fields: [
            {
              name: 'ogTitle',
              type: 'text',
              localized: true,
            },
            {
              name: 'ogDescription',
              type: 'textarea',
              localized: true,
            },
          ],
        },
      ],
    },
  ],
}
