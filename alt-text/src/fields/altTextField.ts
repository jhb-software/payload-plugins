import type { TextareaField } from 'payload'

import { translatedLabel } from '../utils/translatedLabel.js'

export function altTextField({
  localized,
  supportedMimeTypes,
}: {
  localized?: TextareaField['localized']
  supportedMimeTypes?: string[]
}): TextareaField {
  return {
    name: 'alt',
    type: 'textarea',
    admin: {
      components: {
        Field: '@jhb.software/payload-alt-text-plugin/client#AltTextField',
      },
      custom: {
        supportedMimeTypes,
      },
    },
    label: translatedLabel('alternateText'),
    localized,
    required: true,
    validate: (value, { data, operation, req: { t } }) => {
      // Since https://github.com/payloadcms/payload/pull/14988, when using external storage (e.g., S3),
      // it is no longer possible to detect whether this validation runs during the initial upload
      // or a regular update by checking the existence of the ID.
      // Instead, compare the timestamps of the createdAt and updatedAt fields.
      const isInitialUpload =
        operation === 'create' ||
        ('createdAt' in data && 'updatedAt' in data && data.createdAt === data.updatedAt)

      // initial upload: allow without alt text
      if (isInitialUpload) {
        return true
      }

      // regular update: require alt text
      if (!value || value.trim().length === 0) {
        // @ts-expect-error - the translation key type does not include the custom key
        return t('@jhb.software/payload-alt-text-plugin:theAlternateTextIsRequired')
      }

      return true
    },
  }
}
