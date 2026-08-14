import type { ArrayField, Field } from 'payload'

import { mergeFieldAdmin } from '../utils/fieldOverrides.js'
import { translatedLabel } from '../utils/translatedLabel.js'

/**
 * Creates a virtual breadcrumbs field that generates the breadcrumbs based on the documents parents.
 *
 * It is not stored in the database, because this would not automatically reflect changes in the parent(s) slug(s).
 */
export function breadcrumbsField({ admin }: { admin?: ArrayField['admin'] } = {}): Field {
  return {
    name: 'breadcrumbs',
    type: 'array',
    interfaceName: 'Breadcrumbs',
    label: translatedLabel('breadcrumbs'),
    labels: {
      plural: translatedLabel('breadcrumbs'),
      singular: translatedLabel('breadcrumb'),
    },
    localized: true,
    required: true,
    virtual: true,
    // Validate by default to allow the document to be updated, without having to set the breadcrumbs field.
    admin: mergeFieldAdmin<NonNullable<ArrayField['admin']>>(
      {
        components: {
          Field: '@jhb.software/payload-pages-plugin/client#BreadcrumbsField',
        },
        disableBulkEdit: true,
        position: 'sidebar',
        readOnly: true,
      },
      admin,
    ),
    fields: [
      {
        type: 'row',
        fields: [
          {
            name: 'slug',
            type: 'text',
            label: translatedLabel('slug'),
            required: true,
            // Validate by default to allow the document to be updated, without having to set the breadcrumbs field.
            admin: {
              width: '33%',
            },
            validate: (_: any): true => true,
          },
          {
            name: 'path',
            type: 'text',
            label: translatedLabel('path'),
            required: true,
            // Validate by default to allow the document to be updated, without having to set the breadcrumbs field.
            admin: {
              width: '33%',
            },
            validate: (_: any): true => true,
          },
          {
            name: 'label',
            type: 'text',
            label: translatedLabel('label'),
            required: true,
            // Validate by default to allow the document to be updated, without having to set the breadcrumbs field.
            admin: {
              width: '33%',
            },
            validate: (_: any): true => true,
          },
        ],
      },
    ],
    hooks: {
      afterRead: [
        // The breadcrumbs are generated in the getVirtualFields collection hook
      ],
    },
    validate: (_: any): true => true,
  }
}
