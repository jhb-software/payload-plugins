import type { TextField } from 'payload'

export function keywordsField(): TextField {
  return {
    name: 'keywords',
    label: 'Keywords',
    type: 'text',
    hasMany: true,
    required: false,
    localized: true,
    hidden: true, // this field is only meant to be used for improving the search
    admin: {
      description: 'Keywords which describe the image. Used for searching the image.',
      readOnly: true,
    },
  }
}
