import type {
  Adapter,
  PluginOptions as CloudStoragePluginOptions,
  CollectionOptions,
  GeneratedAdapter,
} from '@payloadcms/plugin-cloud-storage/types'
import type { CollectionBeforeChangeHook, Config, Field, Plugin } from 'payload'

import { cloudStoragePlugin } from '@payloadcms/plugin-cloud-storage'
import { initClientUploads } from '@payloadcms/plugin-cloud-storage/utilities'
import { v2 as cloudinary } from 'cloudinary'

import type { CloudinaryClientUploadHandlerExtra } from './client/CloudinaryClientUploadHandler.js'
import type { CloudinaryStorageOptions } from './types.js'

import { getGenerateUrl } from './generateURL.js'
import { getAdminThumbnailFactory } from './getAdminThumbnail.js'
import { getGenerateSignature } from './getGenerateSignature.js'
import { getHandleDelete } from './handleDelete.js'
import { getHandleUpload } from './handleUpload.js'
import { getStaticHandler } from './staticHandler.js'

const defaultUploadOptions: Partial<CloudinaryStorageOptions> = {
  enabled: true,
  useFilename: true,
}

export const payloadCloudinaryPlugin: (cloudinaryStorageOpts: CloudinaryStorageOptions) => Plugin =
  (incomingOptions: CloudinaryStorageOptions) =>
  (incomingConfig: Config): Config => {
    cloudinary.config({
      api_key: incomingOptions.credentials.apiKey,
      api_secret: incomingOptions.credentials.apiSecret,
      cloud_name: incomingOptions.cloudName,
    })

    const options = {
      ...defaultUploadOptions,
      ...incomingOptions,
    }

    const fields: Field[] = [
      {
        name: 'cloudinaryPublicId',
        type: 'text',
        admin: {
          disableBulkEdit: true,
          hidden: true,
          readOnly: true,
        },
        label: 'Cloudinary Public ID',
        required: false, // set to false to match with the default url field
      },
    ]

    const isPluginDisabled = options.enabled === false

    initClientUploads<
      CloudinaryClientUploadHandlerExtra,
      CloudinaryStorageOptions['collections'][keyof CloudinaryStorageOptions['collections']]
    >({
      clientHandler: '@jhb.software/payload-cloudinary-plugin/client#CloudinaryClientUploadHandler',
      collections: options.collections,
      config: incomingConfig,
      enabled: !isPluginDisabled && Boolean(options.clientUploads),
      extraClientHandlerProps: (collection) =>
        ({
          apiKey: options.credentials.apiKey,
          cloudName: options.cloudName,
          folder: options.folder,
          prefix: (typeof collection === 'object' && collection.prefix) || '',
          useFilename: options.useFilename,
        }) satisfies CloudinaryClientUploadHandlerExtra,
      serverHandler: getGenerateSignature({
        access:
          typeof options.clientUploads === 'object' ? options.clientUploads.access : undefined,
        apiSecret: options.credentials.apiSecret,
      }),
      serverHandlerPath: '/cloudinary-generate-signature',
    })

    if (isPluginDisabled) {
      return incomingConfig
    }

    const adapter = cloudinaryStorageAdapter({ ...options })

    // Add adapter to each collection option object
    const collectionsWithAdapter: CloudStoragePluginOptions['collections'] = Object.entries(
      options.collections,
    ).reduce(
      (acc, [slug, collOptions]) => ({
        ...acc,
        [slug]: {
          ...(collOptions === true ? {} : collOptions),
          adapter,
        },
      }),
      {} as Record<string, CollectionOptions>,
    )

    // Set disableLocalStorage: true for collections specified in the plugin options
    const config = {
      ...incomingConfig,
      collections: (incomingConfig.collections || []).map((collection) => {
        if (!collectionsWithAdapter[collection.slug]) {
          return collection
        }

        return {
          ...collection,
          fields: [...fields, ...(collection.fields || [])],
          upload: {
            ...(typeof collection.upload === 'object' ? collection.upload : {}),
            adminThumbnail: getAdminThumbnailFactory(options.cloudName),
            crop: false,
            disableLocalStorage: true,
          },
        }
      }),
    }

    const result = cloudStoragePlugin({
      collections: collectionsWithAdapter,
    })(config)

    // @payloadcms/plugin-cloud-storage 3.82+ skips adapter.handleUpload for files carrying a
    // clientUploadContext, so the Cloudinary publicId and secure URL no longer reach the doc
    // via that path. Persist them here instead — collection-level beforeChange runs after the
    // URL field hook, letting us overwrite data.url with the Cloudinary CDN URL.
    result.collections = (result.collections || []).map((collection) => {
      if (!collectionsWithAdapter[collection.slug]) {
        return collection
      }
      const existingHooks = collection.hooks || {}
      return {
        ...collection,
        hooks: {
          ...existingHooks,
          beforeChange: [persistClientUploadContext, ...(existingHooks.beforeChange || [])],
        },
      }
    })

    return result
  }

const persistClientUploadContext: CollectionBeforeChangeHook = ({ data, req }) => {
  const ctx = req?.file?.clientUploadContext
  if (!ctx || typeof ctx !== 'object') {
    return data
  }
  if ('publicId' in ctx && typeof ctx.publicId === 'string') {
    data.cloudinaryPublicId = ctx.publicId
  }
  if ('secureUrl' in ctx && typeof ctx.secureUrl === 'string') {
    data.url = ctx.secureUrl
  }
  return data
}

function cloudinaryStorageAdapter(options: CloudinaryStorageOptions): Adapter {
  return ({ prefix }): GeneratedAdapter => {
    const folderSrc = options.folder ? options.folder.replace(/^\/|\/$/g, '') + '/' : '' // ensure only trailing slash is present

    return {
      name: 'cloudinary',
      clientUploads: options.clientUploads,
      generateURL: getGenerateUrl({ options }),
      handleDelete: getHandleDelete(),
      handleUpload: getHandleUpload({
        folderSrc,
        prefix,
        useFilename: options.useFilename,
      }),
      staticHandler: getStaticHandler(),
    }
  }
}
