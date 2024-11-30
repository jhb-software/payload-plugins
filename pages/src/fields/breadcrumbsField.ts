import { Field } from 'payload'

/**
 * Creates a virtual breadcrumbs field that generates the breadcrumbs based on the documents parents.
 *
 * It is not stored in the database, because this would not automatically reflect changes in the parent(s) slug(s).
 */
export function breadcrumbsField(): Field {
  return {
    name: 'breadcrumbs',
    interfaceName: 'Breadcrumbs',
    type: 'array',
    required: true,
    virtual: true,
    fields: [
      {
        type: 'row',
        fields: [
          {
            name: 'slug',
            required: true,
            type: 'text',
            localized: true,
            admin: {
              width: '33%',
            },
          },
          {
            name: 'path',
            required: true,
            type: 'text',
            localized: true,
            admin: {
              width: '33%',
            },
          },
          {
            name: 'label',
            required: true,
            type: 'text',
            localized: true,
            admin: {
              width: '33%',
            },
          },
        ],
      },
    ],
    admin: {
      readOnly: true,
      position: 'sidebar',
    },
    hooks: {
      afterRead: [
        // The breadcrumbs are generated in the getVirtualFields collection hook
      ],
    },
  }
}