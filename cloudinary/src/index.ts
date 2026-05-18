import type {
  Adapter,
  PluginOptions as CloudStoragePluginOptions,
  CollectionOptions,
  GeneratedAdapter,
} from '@payloadcms/plugin-cloud-storage/types'
import type { Config, Field, Plugin, TextField } from 'payload'

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
import { generatePublicId } from './utilities/generatePublicId.js'

const folderSrcOf = (folder?: string) => (folder ? folder.replace(/^\/|\/$/g, '') + '/' : '')

const collectionPrefixOf = (collOptions: CloudinaryStorageOptions['collections'][string]) =>
  (typeof collOptions === 'object' && collOptions.prefix) || ''

// Cloudinary's public_id is fully determined by what the plugin tells Cloudinary to use:
// `${folder}/${collectionPrefix}${filename without extension}`. No piece comes from the
// upload response, so the field can be persisted via a beforeChange hook driven by
// data.filename — identical to how @payloadcms/storage-s3 reconstructs S3 keys without
// per-doc state. Aligning with that pattern removes the need for adapters to receive
// clientUploadContext through afterChange (which upstream now skips).
const buildPublicIdField = ({
  collectionPrefix,
  folderSrc,
}: {
  collectionPrefix: string
  folderSrc: string
}): TextField => ({
  name: 'cloudinaryPublicId',
  type: 'text',
  admin: {
    disableBulkEdit: true,
    hidden: true,
    readOnly: true,
  },
  hooks: {
    beforeChange: [
      ({ data, originalDoc, value }) => {
        const filename =
          (data && typeof data.filename === 'string' && data.filename) ||
          (originalDoc && typeof originalDoc.filename === 'string' && originalDoc.filename) ||
          undefined
        if (!filename) {
          return value
        }
        return `${folderSrc}${generatePublicId(collectionPrefix, filename)}`
      },
    ],
  },
  label: 'Cloudinary Public ID',
  required: false,
})

export const payloadCloudinaryPlugin: (cloudinaryStorageOpts: CloudinaryStorageOptions) => Plugin =
  (incomingOptions: CloudinaryStorageOptions) =>
  (incomingConfig: Config): Config => {
    cloudinary.config({
      api_key: incomingOptions.credentials.apiKey,
      api_secret: incomingOptions.credentials.apiSecret,
      cloud_name: incomingOptions.cloudName,
    })

    const options = { enabled: true, ...incomingOptions }
    const folderSrc = folderSrcOf(options.folder)

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

    const collectionsWithAdapter: CloudStoragePluginOptions['collections'] = Object.entries(
      options.collections,
    ).reduce(
      (acc, [slug, collOptions]) => ({
        ...acc,
        [slug]: {
          ...(collOptions === true ? {} : collOptions),
          adapter: cloudinaryStorageAdapter({
            clientUploads: options.clientUploads,
            cloudName: options.cloudName,
            collectionPrefix: collectionPrefixOf(collOptions),
            folderSrc,
          }),
        },
      }),
      {} as Record<string, CollectionOptions>,
    )

    const config = {
      ...incomingConfig,
      collections: (incomingConfig.collections || []).map((collection) => {
        const collOptions = options.collections[collection.slug]
        if (!collOptions) {
          return collection
        }
        const collectionPrefix = collectionPrefixOf(collOptions)
        const publicIdField: Field = buildPublicIdField({ collectionPrefix, folderSrc })

        return {
          ...collection,
          fields: [publicIdField, ...(collection.fields || [])],
          upload: {
            ...(typeof collection.upload === 'object' ? collection.upload : {}),
            adminThumbnail: getAdminThumbnailFactory({
              cloudName: options.cloudName,
              collectionPrefix,
              folderSrc,
            }),
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

function cloudinaryStorageAdapter({
  clientUploads,
  cloudName,
  collectionPrefix,
  folderSrc,
}: {
  clientUploads?: CloudinaryStorageOptions['clientUploads']
  cloudName: string
  collectionPrefix: string
  folderSrc: string
}): Adapter {
  return (): GeneratedAdapter => ({
    name: 'cloudinary',
    clientUploads,
    generateURL: getGenerateUrl({ cloudName, collectionPrefix, folderSrc }),
    handleDelete: getHandleDelete(),
    handleUpload: getHandleUpload({ collectionPrefix, folderSrc }),
    staticHandler: getStaticHandler({ cloudName, collectionPrefix, folderSrc }),
  })
}
