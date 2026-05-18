import type { StaticHandler } from '@payloadcms/plugin-cloud-storage/types'

import type { ClientUploadContext } from './client/CloudinaryClientUploadHandler.js'

import { generateCloudinaryUrl } from './utilities/generateCloudinaryUrl.js'
import { generatePublicId } from './utilities/generatePublicId.js'

// staticHandler is called for two distinct flows:
//   1. After a client upload, addDataAndFileToRequest invokes it with
//      params.clientUploadContext so it can fetch the file content from Cloudinary for
//      server-side size generation.
//   2. When the admin (or any client of /api/{collection}/file/{filename}) requests the
//      original file with disablePayloadAccessControl: false. The doc.url field may
//      point back at this same route (Payload's default for upload collections), so the
//      handler must NOT read doc.url to find the Cloudinary location — it must derive
//      the Cloudinary public_id itself, the same way the rest of the plugin does.
export const getStaticHandler = ({
  cloudName,
  collectionPrefix,
  folderSrc,
}: {
  cloudName: string
  collectionPrefix: string
  folderSrc: string
}): StaticHandler => {
  return async (req, { doc, params }) => {
    try {
      type Params = {
        clientUploadContext?: ClientUploadContext
        collection: string
        filename: string
      }
      const { clientUploadContext, collection, filename } = params as Params

      let secureUrl: string | undefined

      if (
        clientUploadContext &&
        typeof clientUploadContext === 'object' &&
        'secureUrl' in clientUploadContext &&
        typeof clientUploadContext.secureUrl === 'string'
      ) {
        secureUrl = clientUploadContext.secureUrl
      } else {
        const mimeType = await getMimeType({
          collection,
          doc: doc as { mimeType?: unknown } | undefined,
          filename,
          req,
        })
        if (mimeType) {
          secureUrl = generateCloudinaryUrl({
            cloudinaryPublicId: `${folderSrc}${generatePublicId(collectionPrefix, filename)}`,
            cloudName,
            mimeType,
          })
        }
      }

      if (!secureUrl) {
        return new Response(null, { status: 404, statusText: 'Not Found' })
      }

      const response = await fetch(secureUrl)
      const arrayBuffer = await response.arrayBuffer()

      const etagFromHeaders = req.headers.get('etag') || req.headers.get('if-none-match')
      const objectEtag = response.headers.get('etag')

      if (etagFromHeaders && etagFromHeaders === objectEtag) {
        return new Response(null, {
          headers: new Headers({
            'Content-Length': response.headers.get('Content-Type') || 'application/octet-stream',
            'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
            ETag: objectEtag,
          }),
          status: 304,
        })
      }

      return new Response(arrayBuffer, {
        headers: {
          'Content-Length': response.headers.get('Content-Length') || '',
          'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
          ETag: objectEtag || '',
        },
      })
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'error' in err &&
        err.error &&
        typeof err.error === 'object' &&
        'http_code' in err.error &&
        err.error.http_code === 404
      ) {
        return new Response(null, { status: 404, statusText: 'Not Found' })
      }
      req.payload.logger.error({ err, msg: 'Unexpected error in staticHandler' })
      return new Response('Internal Server Error', { status: 500 })
    }
  }
}

async function getMimeType({
  collection,
  doc,
  filename,
  req,
}: {
  collection: string
  doc?: { mimeType?: unknown }
  filename: string
  req: Parameters<StaticHandler>[0]
}): Promise<string | undefined> {
  if (doc && typeof doc.mimeType === 'string') {
    return doc.mimeType
  }
  const result = await req.payload.find({
    collection,
    limit: 1,
    pagination: false,
    req,
    select: { mimeType: true },
    where: { filename: { equals: filename } },
  })
  const found = result.docs[0] as { mimeType?: unknown } | undefined
  return found && typeof found.mimeType === 'string' ? found.mimeType : undefined
}
