import type { CollectionConfig } from 'payload'

import type { CloudinaryPluginConfig } from '../types/CloudinaryPluginConfig'

import afterDeleteHook from '../hooks/afterDelete'
import beforeChangeHook from '../hooks/beforeChange'

/**
 * Extends the given `CollectionConfig` with all hooks and fields needed for the Cloudinary integration.
 */
export const extendUploadCollectionConfig = ({
  config,
  pluginConfig,
}: {
  config: CollectionConfig
  pluginConfig: CloudinaryPluginConfig
}): CollectionConfig => ({
  ...config,
  admin: {
    defaultColumns: ['filename', 'createdAt'],
    listSearchableFields: ['filename'],
    ...config.admin,
  },
  disableDuplicate: true,
  fields: [
    {
      // This field is needed to delete and update cloudinary files.
      name: 'cloudinaryPublicId',
      type: 'text',
      access: {
        create: () => false,
        update: () => false,
      },
      admin: {
        position: 'sidebar',
        readOnly: true,
        // hide the field before the file is uploaded and the id is generated:
        condition: (data) => Boolean(data?.cloudinaryPublicId),
      },
      required: true,
    },
    // Payload automatically adds a `url` field to media collections.
    // To override its value to match the Cloudinary URL, we need to define it here. Otherwise updates to the media document would fail.
    {
      name: 'url',
      type: 'text',
      admin: {
        hidden: true,
        readOnly: true,
      },
      hooks: {
        afterRead: [({ data }) => data?.cloudinaryURL],
      },
      label: 'URL',
    },
    {
      // TODO: remove this field in favor of the default url field added by Payload.
      name: 'cloudinaryURL',
      type: 'text',
      access: {
        create: () => false,
        update: () => false,
      },
      admin: {
        position: 'sidebar',
        readOnly: true,
        // hide the field before the file is uploaded and the URL is generated:
        condition: (data) => Boolean(data?.cloudinaryURL),
      },
      label: 'Cloudinary URL',
      required: true,
    },
    ...(config.fields ?? []),
  ],
  forceSelect: {
    // force select these to ensure the adminThumbnail hook always receives the necessary data:
    cloudinaryURL: true,
    mimeType: true,
  },
  hooks: {
    ...config.hooks,
    afterDelete: [...(config.hooks?.afterDelete ?? []), afterDeleteHook],
    beforeChange: [...(config.hooks?.beforeChange ?? []), beforeChangeHook(pluginConfig)],
  },
  upload: {
    ...(typeof config.upload === 'object' ? config.upload : {}),
    adminThumbnail: ({ doc }) => {
      const transformOptions = 'w_300,h_300,c_fill,f_auto,q_auto,dpr_auto'

      if (!('cloudinaryURL' in doc) || typeof doc.cloudinaryURL !== 'string') {
        throw new Error(
          'Could not generate the admin thumbnail because the cloudinaryURL was not passed to the hook.',
        )
      }

      const newUrl = doc.cloudinaryURL.replace('/upload', `/upload/${transformOptions}`)

      if (!('mimeType' in doc) || typeof doc.mimeType !== 'string') {
        throw new Error(
          'Could not generate the admin thumbnail because the mineType was not passed to the hook.',
        )
      }

      // As payload does not support videos as thumbnails, create an image thumbnail of the video:
      if (doc.mimeType.startsWith('video/')) {
        const videoThumbnailExtension = '.webp'
        const videoExtension = doc.cloudinaryURL.split('/').pop()?.split('.').pop()
        const videoThumbnailUrl = newUrl.replace(`.${videoExtension}`, videoThumbnailExtension)

        return videoThumbnailUrl
      }

      return newUrl
    },
    crop: false,
    disableLocalStorage: true,
  },
})
