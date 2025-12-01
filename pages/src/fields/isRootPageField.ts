import type { Field } from 'payload'

import type { PagesPluginConfig } from '../types/PagesPluginConfig.js'

import { beforeDuplicateIsRootPage } from '../hooks/beforeDuplicate.js'
import { translatedLabel } from '../utils/translatedLabel.js'

export function isRootPageField({
  baseFilter,
}: {
  baseFilter: PagesPluginConfig['baseFilter']
}): Field {
  return {
    name: 'isRootPage',
    type: 'checkbox',
    admin: {
      components: {
        Field: {
          path: '@jhb.software/payload-pages-plugin/server#IsRootPageField',
          serverProps: {
            baseFilter,
          },
        },
      },
      position: 'sidebar',
    },
    hooks: {
      beforeDuplicate: [beforeDuplicateIsRootPage],
    },
    label: translatedLabel('isRootPage'),
  }
}
