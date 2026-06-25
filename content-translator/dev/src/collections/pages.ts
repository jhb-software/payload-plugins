import type { CollectionConfig } from 'payload'

export const pagesSchema: CollectionConfig = {
  slug: 'pages',
  versions: true,
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
      // hasMany text field: each keyword is translated individually
      name: 'keywords',
      type: 'text',
      hasMany: true,
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
      // Unnamed (presentational) group: its fields are stored on the document
      // root, not under a key. Used here to demonstrate that the translator
      // traverses into unnamed groups instead of throwing.
      type: 'group',
      label: 'Call to action',
      fields: [
        {
          name: 'ctaLabel',
          type: 'text',
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
