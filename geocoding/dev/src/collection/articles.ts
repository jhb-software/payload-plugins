import { geocodingField } from '../../../src/fields/geocodingField'

import type { CollectionConfig } from 'payload'

import { lexicalEditor, BlocksFeature } from '@payloadcms/richtext-lexical'

/**
 * A collection for testing the geocoding field inside a Lexical editor block.
 */
export const Articles: CollectionConfig = {
  slug: 'articles',
  admin: {
    useAsTitle: 'title',
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
        features: [
          BlocksFeature({
            blocks: [
              {
                slug: 'locationBlock',
                fields: [
                  {
                    name: 'label',
                    type: 'text',
                  },
                  geocodingField({
                    pointField: {
                      name: 'location',
                      type: 'point',
                    },
                  }),
                ],
              },
            ],
          }),
        ],
      }),
    },
  ],
}
