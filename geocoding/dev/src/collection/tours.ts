import type { CollectionConfig } from 'payload'

import { geocodingField } from '../../../src/fields/geocodingField'

/** A localized point: each locale has its own place, e.g. a tour's meeting point per language. */
export const Tours: CollectionConfig = {
  slug: 'tours',
  fields: [
    { name: 'title', type: 'text', localized: true },
    geocodingField({
      pointField: {
        name: 'meetingPoint',
        type: 'point',
        localized: true,
      },
    }),
  ],
}
