import type { TextareaField } from 'payload'

import { translatedLabel } from '../utils/translatedLabel.js'
import { validateAltText } from './validateAltText.js'

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
    validate: validateAltText,
  }
}
