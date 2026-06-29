import type { CollectionConfig } from 'payload'

/** Minimal slugifier for the demo (lowercase, non-word runs → hyphens). */
const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '')

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
      // Slug derived from the title: skip translation entirely and re-slugify
      // the already-translated title, so translating an English page produces a
      // localized German slug (e.g. "Travel Tips" → "reisetipps").
      name: 'slug',
      type: 'text',
      custom: {
        'content-translator': {
          afterTranslate: ({ siblingData }) => slugify(String(siblingData.title ?? '')),
          skip: true,
        },
      },
      index: true,
      localized: true,
      required: true,
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
