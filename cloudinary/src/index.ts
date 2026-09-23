import type {
  Adapter,
  PluginOptions as CloudStoragePluginOptions,
  CollectionOptions,
  GeneratedAdapter,
} from '@payloadcms/plugin-cloud-storage/types'
import type {
  CollectionBeforeChangeHook,
  CollectionBeforeOperationHook,
  Config,
  Field,
  Payload,
  Plugin,
  UploadConfig,
} from 'payload'

import { cloudStoragePlugin } from '@payloadcms/plugin-cloud-storage'
import { initClientUploads } from '@payloadcms/plugin-cloud-storage/utilities'
import { v2 as cloudinary } from 'cloudinary'
import { APIError } from 'payload'

import type {
  CloudinaryClientUploadHandlerExtra,
  VerifiedClientUploadContext,
} from './client/CloudinaryClientUploadHandler.js'
import type { CloudinaryStorageOptions } from './types.js'

import { getGenerateUrl } from './generateURL.js'
import { getAdminThumbnailFactory } from './getAdminThumbnail.js'
import { getConfirmUpload } from './getConfirmUpload.js'
import { getGenerateSignature } from './getGenerateSignature.js'
import { getHandleDelete } from './handleDelete.js'
import { clientUploadContextKey, getHandleUpload } from './handleUpload.js'
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

    // Captured in `onInit` so adapter callbacks without a request (e.g. `generateURL`) can log
    // through the Payload logger. Read lazily: no logger exists while the config is built.
    let logger: Payload['logger'] | undefined
    const getLogger = () => logger

    const fields: Field[] = [
      {
        name: 'cloudinaryPublicId',
        type: 'text',
        // Only the plugin writes this field (from hooks and adapter callbacks, which bypass field
        // access). A caller-supplied id would point the document at an arbitrary asset.
        access: { create: () => false, update: () => false },
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
    const clientUploadsEnabled = !isPluginDisabled && Boolean(options.clientUploads)
    const clientUploadsAccess =
      typeof options.clientUploads === 'object' ? options.clientUploads.access : undefined
    const collectionPrefixes = Object.fromEntries(
      Object.entries(options.collections).map(([slug, collOptions]) => [
        slug,
        (typeof collOptions === 'object' && collOptions.prefix) || '',
      ]),
    )

    // Suffixed like initClientUploads' own endpoint so the plugin can be applied multiple times.
    const confirmHandlerBasePath = '/cloudinary-confirm-upload'
    const existingConfirmHandlers = (incomingConfig.endpoints || []).filter((endpoint) =>
      endpoint.path?.startsWith(confirmHandlerBasePath),
    ).length
    const confirmHandlerPath = existingConfirmHandlers
      ? `${confirmHandlerBasePath}-${existingConfirmHandlers}`
      : confirmHandlerBasePath

    initClientUploads<
      CloudinaryClientUploadHandlerExtra,
      CloudinaryStorageOptions['collections'][keyof CloudinaryStorageOptions['collections']]
    >({
      clientHandler: '@jhb.software/payload-cloudinary-plugin/client#CloudinaryClientUploadHandler',
      collections: options.collections,
      config: incomingConfig,
      enabled: clientUploadsEnabled,
      extraClientHandlerProps: () =>
        ({
          apiKey: options.credentials.apiKey,
          cloudName: options.cloudName,
          confirmHandlerPath,
        }) satisfies CloudinaryClientUploadHandlerExtra,
      serverHandler: getGenerateSignature({
        access: clientUploadsAccess,
        apiSecret: options.credentials.apiSecret,
        collectionPrefixes,
        folder: options.folder,
        useFilename: options.useFilename,
      }),
      serverHandlerPath: '/cloudinary-generate-signature',
    })

    if (clientUploadsEnabled) {
      incomingConfig.endpoints = [
        ...(incomingConfig.endpoints || []),
        {
          handler: getConfirmUpload({
            access: clientUploadsAccess,
            apiSecret: options.credentials.apiSecret,
            cloudName: options.cloudName,
            collections: Object.keys(options.collections),
          }),
          method: 'post',
          path: confirmHandlerPath,
        },
      ]
    }

    if (isPluginDisabled) {
      return incomingConfig
    }

    const adapter = cloudinaryStorageAdapter({ ...options }, getLogger)

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
    // Reads `req.file` only: when core re-encoded the file and dropped the context, the server
    // re-upload's result must win so the metadata matches the processed bytes.
    const persistClientUploadContext: CollectionBeforeChangeHook = ({ data, req }) => {
      const clientUploadContext = (
        req?.file as { clientUploadContext?: VerifiedClientUploadContext } | undefined
      )?.clientUploadContext

      if (clientUploadContext) {
        data.cloudinaryPublicId = clientUploadContext.publicId
        data.url = clientUploadContext.secureUrl
      }

      return data
    }

    // generateFileData deletes `req.file.clientUploadContext` when sharp re-encodes the file.
    // beforeOperation runs before that, so stash the browser upload for handleUpload to replace it.
    const stashClientUploadContext: CollectionBeforeOperationHook = ({ operation, req }) => {
      if (operation !== 'create' && operation !== 'update') {
        return
      }
      const clientUploadContext = (
        req.file as { clientUploadContext?: VerifiedClientUploadContext } | undefined
      )?.clientUploadContext

      if (!clientUploadContext) {
        delete req.context[clientUploadContextKey]
        return
      }

      // Core accepts any receipt this plugin issued, including the pending one from the signature
      // endpoint. Only a confirmed upload carries a server-built URL.
      if (
        typeof clientUploadContext.publicId !== 'string' ||
        typeof clientUploadContext.secureUrl !== 'string'
      ) {
        throw new APIError('A confirmed client upload reference is required.', 400)
      }

      req.context[clientUploadContextKey] = clientUploadContext
    }

    const incomingOnInit = result.onInit
    result.onInit = async (payload) => {
      logger = payload.logger
      await incomingOnInit?.(payload)
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
          beforeOperation: [stashClientUploadContext, ...(existingHooks.beforeOperation || [])],
        },
      }

      // With `disablePayloadAccessControl: true`, cloud-storage only invokes the static handler when
      // the request carries a `clientUploadContext`, so a plain admin GET of the file 404s with
      // "missing on the disk". The plugin's static handler resolves the file by filename, so register
      // it as the first handler for those collections. Other collections already get the static handler
      // from cloud-storage unconditionally.
      // Core runs every handler when fetching a client upload, so this one skips requests with a
      // `clientUploadContext` (cloud-storage's handler serves those) to fetch the file only once.
      if (typeof collOptions !== 'object' || collOptions.disablePayloadAccessControl !== true) {
        return withHook
      }

      const upload = typeof collection.upload === 'object' ? collection.upload : {}
      const staticHandler = getStaticHandler({ cloudName: options.cloudName })
      const serveByFilename: NonNullable<UploadConfig['handlers']>[number] = (req, args) =>
        'clientUploadContext' in args.params && args.params.clientUploadContext
          ? undefined
          : staticHandler(req, args)
      const existingHandlers = Array.isArray(upload.handlers) ? upload.handlers : []

      return {
        ...withHook,
        upload: { ...upload, handlers: [serveByFilename, ...existingHandlers] },
      }
    })

    return result
  }

function cloudinaryStorageAdapter(
  options: CloudinaryStorageOptions,
  getLogger: () => Payload['logger'] | undefined,
): Adapter {
  return ({ prefix }): GeneratedAdapter => {
    const folderSrc = options.folder ? options.folder.replace(/^\/|\/$/g, '') + '/' : '' // ensure only trailing slash is present

    return {
      name: 'cloudinary',
      clientUploads: options.clientUploads,
      generateURL: getGenerateUrl({ getLogger, options }),
      handleDelete: getHandleDelete(),
      handleUpload: getHandleUpload({
        folderSrc,
        prefix,
        useFilename: options.useFilename,
      }),
      requiresClientUploadReceipt: true,
      staticHandler: getStaticHandler({ cloudName: options.cloudName }),
    }
  }
}
