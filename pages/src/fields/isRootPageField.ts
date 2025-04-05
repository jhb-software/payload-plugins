import { Field } from 'payload'
import { translatedLabel } from '../utils/translatedLabel.js'

export function isRootPageField(): Field {
  return {
    name: 'isRootPage',
    label: translatedLabel('isRootPage'),
    type: 'checkbox',
    admin: {
      position: 'sidebar',
      components: {
        Field: {
          path: '@jhb.software/payload-pages-plugin/server#IsRootPageField',
        },
      },
    },
  }
}
