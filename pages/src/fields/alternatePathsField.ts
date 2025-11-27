import type { Field } from 'payload'

import { translatedLabel } from '../utils/translatedLabel.js'

/** Virtual field which holds the paths for the alternate languages. */
export function alternatePathsField(): Field {
  return {
    name: 'alternatePaths',
    type: 'array',
    label: translatedLabel('alternatePaths'),
    labels: {
      plural: translatedLabel('alternatePaths'),
      singular: translatedLabel('alternatePath'),
    },
    localized: false,
    required: true,
    virtual: true,
    // Validate by default to allow the document to be updated, without having to set the alternatePaths field.
    admin: {
      disableBulkEdit: true,
      hidden: true,
      readOnly: true,
    },
    fields: [
      {
        name: 'hreflang',
        type: 'text',
        required: true,
      },
      {
        name: 'path',
        type: 'text',
        required: true,
      },
    ],
    hooks: {
      afterRead: [
        // The alternate paths are generated in the setVirtualFields collection hook
      ],
    },
    validate: (_: any): true => true,
  }
}
