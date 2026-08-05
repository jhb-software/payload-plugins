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

import type {
  ClientUploadContext,
  CloudinaryClientUploadHandlerExtra,
} from './client/CloudinaryClientUploadHandler.js'
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
        collections: Object.keys(options.collections),
        folder: options.folder,
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

    // The workarounds below only matter when client uploads are enabled; otherwise cloud-storage's
    // own afterChange/handleUpload and static handler behave as this plugin expects.
    if (!options.clientUploads) {
      return result
    }

    // Since Payload 3.82, cloud-storage's afterChange skips handleUpload for files that carry a
    // `clientUploadContext`. This plugin relied on handleUpload to persist `cloudinaryPublicId`/`url`
    // from that context, so without this hook a client-uploaded document is saved without a usable URL.
    const persistClientUploadContext: CollectionBeforeChangeHook = ({ data, req }) => {
      const clientUploadContext = (req?.file as { clientUploadContext?: ClientUploadContext })
        ?.clientUploadContext

      if (clientUploadContext) {
        data.cloudinaryPublicId = clientUploadContext.publicId
        data.url = clientUploadContext.secureUrl
      }

      return data
    }

    result.collections = (result.collections || []).map((collection) => {
      const collOptions = options.collections[collection.slug]
      if (!collOptions) {
        return collection
      }

      const existingHooks = collection.hooks || {}
      const withHook = {
        ...collection,
        hooks: {
          ...existingHooks,
          beforeChange: [persistClientUploadContext, ...(existingHooks.beforeChange || [])],
        },
      }

      // With `disablePayloadAccessControl: true`, cloud-storage only invokes the static handler when
      // the request carries a `clientUploadContext`, so a plain admin GET of the file 404s with
      // "missing on the disk". The plugin's static handler resolves the file by filename, so register
      // it as the first handler for those collections. Other collections already get the static handler
      // from cloud-storage unconditionally.
      if (typeof collOptions !== 'object' || collOptions.disablePayloadAccessControl !== true) {
        return withHook
      }

      const upload = typeof collection.upload === 'object' ? collection.upload : {}
      const existingHandlers = Array.isArray(upload.handlers) ? upload.handlers : []

      return {
        ...withHook,
        upload: { ...upload, handlers: [getStaticHandler(), ...existingHandlers] },
      }
    })

    return result
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
