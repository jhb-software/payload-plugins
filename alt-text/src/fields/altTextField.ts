import type { TextareaField, TextareaFieldValidation } from 'payload'

import { validateAltText } from '../utilities/mimeTypes.js'
import { translatedLabel } from '../utils/translatedLabel.js'

export function altTextField({
  localized,
  supportedMimeTypes,
  trackedMimeTypes,
  validate,
}: {
  localized?: TextareaField['localized']
  /** MIME types the resolver can generate for — used to disable the Generate button. */
  supportedMimeTypes?: string[]
  /** MIME types for which alt text is tracked — used to hide the field and skip validation for others. */
  trackedMimeTypes?: string[]
  /** Custom validator that fully replaces the default. */
  validate?: TextareaFieldValidation
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
        trackedMimeTypes,
      },
    },
    label: translatedLabel('alternateText'),
    localized,
    required: true,
    validate:
      validate ??
      ((value, args) =>
        validateAltText(value, args as Parameters<typeof validateAltText>[1], trackedMimeTypes)),
  }
}
