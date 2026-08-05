import {
  BlocksFeature,
  EXPERIMENTAL_TableFeature,
  lexicalEditor,
  UploadFeature,
} from '@payloadcms/richtext-lexical'
import type { CollectionConfig } from 'payload'

import { BadgeBlock, CtaBlock } from '../blocks'

// Base URL of the Astro preview app that renders documents.
const astroOrigin = process.env.ASTRO_ORIGIN ?? 'http://localhost:4321'

/**
 * A single rich-text document. The `content` field enables the Lexical
 * `TableFeature` (off by default) so tables can be authored in the real
 * editor and their serialized output fetched by the Astro preview app.
 */
export const Documents: CollectionConfig = {
  slug: 'documents',
  admin: {
    useAsTitle: 'title',
    description: 'Author rich text (incl. tables) here, then render it in the Astro app at /live.',
    // "Preview" button → the Astro app rendering just this document.
    preview: (doc) => `${astroOrigin}/preview/${doc.id}`,
    // Live Preview tab → same page in an iframe; it reloads on save via the
    // LivePreviewRefresh script in the Astro app.
    livePreview: {
      url: ({ data }) => `${astroOrigin}/preview/${data.id}`,
      breakpoints: [
        { name: 'mobile', label: 'Mobile', width: 375, height: 667 },
        { name: 'tablet', label: 'Tablet', width: 768, height: 1024 },
        { name: 'desktop', label: 'Desktop', width: 1440, height: 900 },
      ],
    },
  },
  access: {
    // Public read so the Astro dev app can fetch over the REST API without auth.
    read: () => true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'content',
      type: 'richText',
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [
          ...defaultFeatures,
          EXPERIMENTAL_TableFeature(),
          UploadFeature({ collections: { media: { fields: [] } } }),
          BlocksFeature({ blocks: [CtaBlock], inlineBlocks: [BadgeBlock] }),
        ],
      }),
    },
  ],
}
