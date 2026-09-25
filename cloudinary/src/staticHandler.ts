import type { StaticHandler } from '@payloadcms/plugin-cloud-storage/types'

import { isXmlMimeType, UPLOAD_CONTENT_SECURITY_POLICY } from 'payload/internal'

import type { VerifiedClientUploadContext } from './client/CloudinaryClientUploadHandler.js'

import { generateCloudinaryUrl } from './utilities/generateCloudinaryUrl.js'

type StoredFile = { cloudinaryPublicId?: unknown; mimeType?: unknown; url?: unknown }

const forwardedHeaders = [
  'Accept-Ranges',
  'Content-Length',
  'Content-Range',
  'ETag',
  'Last-Modified',
]

// This is called:
// - after the client upload is finished with the clientUploadContext
// - whenever the file is requested from the api/[collection]/[filename] path
export const getStaticHandler = ({ cloudName }: { cloudName: string }): StaticHandler => {
  return async (req, { doc, params }) => {
    try {
      type Params = {
        clientUploadContext?: VerifiedClientUploadContext
        collection: string
        filename: string
      }
      const { clientUploadContext, collection, filename } = params as Params

      let secureUrl: string | undefined

      if (clientUploadContext) {
        // Core fetches client uploads before any hook runs, so a pending receipt from the signature
        // endpoint reaches this handler too. Without a server-built URL it must not fall back to
        // the filename lookup, which would fetch another document's file.
        if (!clientUploadContext.secureUrl) {
          return new Response(null, { status: 400, statusText: 'Bad Request' })
        }
        secureUrl = clientUploadContext.secureUrl
      } else {
        const stored =
          doc && typeof (doc as StoredFile).cloudinaryPublicId === 'string'
            ? (doc as StoredFile)
            : ((
                await req.payload.find({
                  collection,
                  limit: 1,
                  pagination: false,
                  req,
                  select: { cloudinaryPublicId: true, mimeType: true, url: true },
                  where: { filename: { equals: filename } },
                })
              ).docs[0] as StoredFile | undefined)

        if (typeof stored?.cloudinaryPublicId === 'string') {
          // Payload does not persist `url` for server uploads, and a read `url` may be Payload's own
          // file route, so only a Cloudinary URL is used as is.
          secureUrl =
            typeof stored.url === 'string' &&
            stored.url.startsWith(`https://res.cloudinary.com/${cloudName}/`)
              ? stored.url
              : generateCloudinaryUrl({
                  cloudinaryPublicId: stored.cloudinaryPublicId,
                  cloudName,
                  mimeType: typeof stored.mimeType === 'string' ? stored.mimeType : undefined,
                })
        }
      }

      if (!secureUrl) {
        req.payload.logger.warn(
          { collection, filename },
          'No publicId or secureUrl found, returning 404',
        )
        return new Response(null, { status: 404, statusText: 'Not Found' })
      }

      // Forward range requests (media seeking, core's header probe) so only the requested bytes
      // leave Cloudinary.
      const range = req.headers.get('range')
      const response = await fetch(secureUrl, range ? { headers: { Range: range } } : undefined)

      const headers = new Headers()
      for (const name of forwardedHeaders) {
        const value = response.headers.get(name)
        if (value) {
          headers.set(name, value)
        }
      }
      const contentType = response.headers.get('Content-Type') || 'application/octet-stream'
      headers.set('Content-Type', contentType)
      if (isXmlMimeType(contentType)) {
        headers.set('Content-Security-Policy', UPLOAD_CONTENT_SECURITY_POLICY)
      }

      const etagFromHeaders = req.headers.get('etag') || req.headers.get('if-none-match')
      const objectEtag = response.headers.get('etag')

      if (etagFromHeaders && etagFromHeaders === objectEtag) {
        await response.body?.cancel()
        headers.delete('Content-Length')
        headers.delete('Content-Range')
        return new Response(null, { headers, status: 304 })
      }

      return new Response(response.body, { headers, status: response.status })
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
        const cloudinaryError =
          'message' in err.error ? err.error.message : JSON.stringify(err.error)

        req.payload.logger.warn(
          { cloudinaryError },
          'Error fetching file from cloudinary, returning 404',
        )
        return new Response(null, { status: 404, statusText: 'Not Found' })
      }

      req.payload.logger.error({ err, msg: 'Unexpected error in staticHandler' })
      return new Response('Internal Server Error', { status: 500 })
    }
  }
}
