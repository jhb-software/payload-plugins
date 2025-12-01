import type { CollectionConfig } from 'payload'

import type { PagesPluginConfig } from '../types/PagesPluginConfig.js'
import type {
  IncomingRedirectsCollectionConfig,
  RedirectsCollectionConfig,
} from '../types/RedirectsCollectionConfig.js'

import { validateRedirect } from '../hooks/validateRedirect.js'

// TODO: Consider the potential benefits of storing the destination page in a relationship field.
//       Note: The destination path should still be explicitly defined to ensure the redirect path remains consistent,
//       even if the destination page's path changes.

/** Creates a collection which stores redirects from one path to another.
 *
 * In contrast to the official redirects plugin, this collection supports validation rules and a reason field.
 */
export const createRedirectsCollectionConfig = ({
  collectionConfig: incomingCollectionConfig,
  pluginConfig,
}: {
  collectionConfig: IncomingRedirectsCollectionConfig
  pluginConfig: PagesPluginConfig
}): CollectionConfig => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const redirectsCollectionConfig: RedirectsCollectionConfig = {
    ...incomingCollectionConfig,
  }

  return {
    ...incomingCollectionConfig,
    custom: {
      ...incomingCollectionConfig.custom,
      // This makes the baseFilter available in hooks etc.
      isRedirectsCollection: true,
      pagesPluginConfig: pluginConfig,
    },
    fields: [
      {
        name: 'sourcePath',
        type: 'text',
        admin: {
          placeholder: '/',
        },
        hooks: {
          beforeDuplicate: [
            // append "-copy" to the value to ensure that the validation succeeds when duplicating a redirect
            ({ value }) => value + '-copy',
          ],
        },
        required: true,
        validate: (value: unknown, { siblingData }: { siblingData: unknown }) => {
          const destinationPath =
            typeof siblingData === 'object' && siblingData && 'destinationPath' in siblingData
              ? siblingData.destinationPath
              : undefined

          if (!value || typeof value !== 'string') {
            return 'A source path is required'
          } else if (destinationPath === value) {
            return 'The provided path must be different from the destination path'
          } else if (value && !value.startsWith('/')) {
            return 'A path must start with a forward slash (/)'
          }

          return true
        },
      },
      {
        name: 'destinationPath',
        type: 'text',
        admin: {
          placeholder: '/',
        },
        hooks: {
          beforeDuplicate: [
            // append "-copy" to the value to ensure that the validation succeeds when duplicating a redirect
            ({ value }) => value + '-copy',
          ],
        },
        required: true,
        validate: (value: unknown, { siblingData }: { siblingData: unknown }) => {
          const sourcePath = (siblingData as { sourcePath: string }).sourcePath

          if (!value || typeof value !== 'string') {
            return 'A destination path is required'
          } else if (sourcePath === value) {
            return 'The provided path must be different from the source path'
          } else if (value && !value.startsWith('/')) {
            return 'A path must start with a forward slash (/)'
          }

          return true
        },
      },
      {
        name: 'type',
        type: 'select',
        defaultValue: 'permanent',
        options: [
          {
            label: 'Permanent',
            value: 'permanent',
          },
          {
            label: 'Temporary',
            value: 'temporary',
          },
        ],
        required: true,
      },
      {
        name: 'reason',
        type: 'textarea',
        required: false,
      },
      ...incomingCollectionConfig.fields,
    ],
    hooks: {
      ...incomingCollectionConfig.hooks,
      beforeValidate: [...(incomingCollectionConfig.hooks?.beforeValidate || []), validateRedirect],
    },
  }
}
