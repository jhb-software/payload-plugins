import type {
  Adapter,
  ClientUploadsConfig,
  PluginOptions as CloudStoragePluginOptions,
  CollectionOptions,
  GeneratedAdapter,
} from '@payloadcms/plugin-cloud-storage/types'
import type { Config, Field, Plugin, UploadCollectionSlug } from 'payload'

import { cloudStoragePlugin } from '@payloadcms/plugin-cloud-storage'
import { initClientUploads } from '@payloadcms/plugin-cloud-storage/utilities'
import { v2 as cloudinary } from 'cloudinary'

import type { CloudinaryClientUploadHandlerExtra } from './client/CloudinaryClientUploadHandler.js'

import { getGenerateUrl } from './generateURL.js'
import { getAdminThumbnail } from './getAdminThumbnail.js'
import { getGenerateSignature } from './getGenerateSignature.js'
import { getHandleDelete } from './handleDelete.js'
import { getHandleUpload } from './handleUpload.js'
import { getStaticHandler } from './staticHandler.js'

export type CloudinaryStorageOptions = {
  /**
   * Do uploads directly on the client, to bypass limits on Vercel.
   */
  clientUploads?: ClientUploadsConfig

  /**
   * Cloudinary cloud name.
   */
  cloudName: string

  /**
   * Collections to apply the Cloudinary storage adapter to
   */
  collections: Partial<Record<UploadCollectionSlug, Omit<CollectionOptions, 'adapter'> | true>>

  /**
   * Cloudinary client configuration.
   */
  credentials: {
    apiKey: string
    apiSecret: string
  }

  /**
   * Whether or not to enable the plugin
   *
   * @default true
   */
  enabled?: boolean

  /**
   * Folder name to upload files to.
   */
  folder?: string

  /**
   * Whether to use the original filename as part of the public ID
   * @default true
   */
  useFilename?: boolean
}

const defaultUploadOptions: Partial<CloudinaryStorageOptions> = {
  enabled: true,
  useFilename: true,
}

type CloudinaryStoragePlugin = (cloudinaryStorageOpts: CloudinaryStorageOptions) => Plugin

export const cloudinaryStorage: CloudinaryStoragePlugin =
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
      clientHandler:
        '@jhb.software/payload-storage-cloudinary/client#CloudinaryClientUploadHandler',
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
        } satisfies CloudinaryClientUploadHandlerExtra),
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
            adminThumbnail: getAdminThumbnail,
            crop: false,
            disableLocalStorage: true,
          },
        }
      }),
    }

    return cloudStoragePlugin({
      collections: collectionsWithAdapter,
    })(config)
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
