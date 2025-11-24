import { CollectionConfig } from 'payload'
import { validateRedirect } from '../hooks/validateRedirect.js'
import type { PagesPluginConfig } from '../types/PagesPluginConfig.js'
import {
  IncomingRedirectsCollectionConfig,
  RedirectsCollectionConfig,
} from '../types/RedirectsCollectionConfig.js'

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
  const redirectsCollectionConfig: RedirectsCollectionConfig = {
    ...incomingCollectionConfig,
  }

  return {
    ...incomingCollectionConfig,
    custom: {
      ...incomingCollectionConfig.custom,
      // This makes the baseFilter available in hooks etc.
      pagesPluginConfig: pluginConfig,
      isRedirectsCollection: true,
    },
    hooks: {
      ...incomingCollectionConfig.hooks,
      beforeValidate: [...(incomingCollectionConfig.hooks?.beforeValidate || []), validateRedirect],
    },
    fields: [
      {
        name: 'sourcePath',
        type: 'text',
        required: true,
        admin: {
          placeholder: '/',
        },
        // @ts-ignore
        validate: (value, { siblingData }) => {
          const destinationPath = siblingData.destinationPath

          if (!value) {
            return 'A source path is required'
          } else if (destinationPath === value) {
            return 'The provided path must be different from the destination path'
          } else if (value && !value.startsWith('/')) {
            return 'A path must start with a forward slash (/)'
          }

          return true
        },
        hooks: {
          beforeDuplicate: [
            // append "-copy" to the value to ensure that the validation succeeds when duplicating a redirect
            ({ value }) => value + '-copy',
          ],
        },
      },
      {
        name: 'destinationPath',
        type: 'text',
        required: true,
        admin: {
          placeholder: '/',
        },
        // @ts-ignore
        validate: (value: string, { siblingData }) => {
          const sourcePath = siblingData.sourcePath

          if (!value) {
            return 'A destination path is required'
          } else if (sourcePath === value) {
            return 'The provided path must be different from the source path'
          } else if (value && !value.startsWith('/')) {
            return 'A path must start with a forward slash (/)'
          }

          return true
        },
        hooks: {
          beforeDuplicate: [
            // append "-copy" to the value to ensure that the validation succeeds when duplicating a redirect
            ({ value }) => value + '-copy',
          ],
        },
      },
      {
        name: 'type',
        type: 'select',
        required: true,
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
      },
      {
        name: 'reason',
        type: 'textarea',
        required: false,
      },
      ...incomingCollectionConfig.fields,
    ],
  }
}
