import type { TextField } from 'payload'

export function keywordsField({ localized }: { localized?: TextField['localized'] }): TextField {
  return {
    name: 'keywords',
    label: 'Keywords',
    type: 'text',
    hasMany: true,
    required: false,
    localized: localized,
    hidden: true, // this field is only meant to be used for improving the search
    admin: {
      description: 'Keywords which describe the image. Used when searching for the image.',
      readOnly: true,
    },
  }
}
