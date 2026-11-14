import type { CollectionConfig, CollectionSlug } from 'payload'

/** Minimal slugifier for the demo (lowercase, non-word runs → hyphens). */
const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '')

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
      // Slug intentionally independent of the title: translate the slug text,
      // then slugify the translation to strip any special characters. Contrast
      // with the pages collection, which derives the slug from the title.
      name: 'slug',
      type: 'text',
      custom: {
        'content-translator': {
          afterTranslate: ({ value }) => slugify(String(value ?? '')),
        },
      },
      index: true,
      localized: true,
      required: true,
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
