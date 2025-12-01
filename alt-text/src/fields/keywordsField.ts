import type { TextField } from 'payload'

import { translatedLabel } from '../utils/translatedLabel.js'

export function keywordsField({ localized }: { localized?: TextField['localized'] }): TextField {
  return {
    name: 'keywords',
    type: 'text',
    admin: {
      description: 'Keywords which describe the image. Used when searching for the image.', // does not need to be translated because it is only used for the JSDoc
      hidden: true, // this field is only meant to be used for improving the search, therefore hide it from the UI
      readOnly: true,
    },
    hasMany: true,
    label: translatedLabel('keywords'),
    localized,
    required: false,
  }
}
