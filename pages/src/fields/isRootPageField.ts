import type { CheckboxField, Field } from 'payload'

import type { PagesPluginConfig } from '../types/PagesPluginConfig.js'

import { beforeDuplicateIsRootPage } from '../hooks/beforeDuplicate.js'
import { mergeFieldAdmin } from '../utils/fieldOverrides.js'
import { translatedLabel } from '../utils/translatedLabel.js'

export function isRootPageField({
  admin,
  baseFilter,
}: {
  admin?: CheckboxField['admin']
  baseFilter: PagesPluginConfig['baseFilter']
}): Field {
  return {
    name: 'isRootPage',
    type: 'checkbox',
    admin: mergeFieldAdmin<NonNullable<CheckboxField['admin']>>(
      {
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
      admin,
    ),
    hooks: {
      beforeDuplicate: [beforeDuplicateIsRootPage],
    },
    label: translatedLabel('isRootPage'),
  }
}
