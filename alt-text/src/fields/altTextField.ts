import type { TextareaField } from 'payload'

export function altTextField({
  localized,
}: {
  localized?: TextareaField['localized']
}): TextareaField {
  return {
    name: 'alt',
    label: 'Alternate text',
    type: 'textarea',
    required: true,
    localized: localized,
    validate: (value, ctx) => {
      // if the document has an id, the alt text is required
      if (ctx.id) {
        if (!value || value.trim().length === 0) {
          return 'The alternate text is required.'
        }
      }

      // The alt text is not required when the document is created because the alt text generation
      // can only be used once the document is created and the image uploaded
      return true
    },
    admin: {
      components: {
        Field: '@jhb.software/payload-alt-text-plugin/client#AltTextField',
      },
    },
  }
}
