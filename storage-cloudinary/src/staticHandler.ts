import type { StaticHandler } from '@payloadcms/plugin-cloud-storage/types'
import type { CollectionSlug } from 'payload'
import type { ClientUploadContext } from './client/CloudinaryClientUploadHandler.js'

// This is called:
// - after the client upload is finished with the clientUploadContext
// - whenever the file is requested from the api/[collection]/[filename] path
export const getStaticHandler = (): StaticHandler => {
  return async (req, { doc, params }) => {
    try {
      type Params = {
        filename: string
        collection: string
        clientUploadContext?: ClientUploadContext
      }
      const { filename, collection, clientUploadContext } = params as Params

      let publicId: string | undefined
      let secureUrl: string | undefined

      if (
        clientUploadContext &&
        'publicId' in clientUploadContext &&
        clientUploadContext.publicId &&
        'secureUrl' in clientUploadContext &&
        clientUploadContext.secureUrl
      ) {
        publicId = clientUploadContext.publicId
        secureUrl = clientUploadContext.secureUrl
      } else {
        if (
          doc &&
          'cloudinaryPublicId' in doc &&
          'url' in doc &&
          typeof doc.cloudinaryPublicId === 'string' &&
          typeof doc.url === 'string'
        ) {
          publicId = doc.cloudinaryPublicId
          secureUrl = doc.url
        } else {
          const result = await req.payload.find({
            collection: collection as CollectionSlug,
            req,
            limit: 1,
            pagination: false,
            select: {
              cloudinaryPublicId: true,
              url: true,
            },
            where: {
              filename: { equals: filename },
            },
          })

          if (
            result.docs.length > 0 &&
            'cloudinaryPublicId' in result.docs[0] &&
            'url' in result.docs[0]
          ) {
            publicId = result.docs[0].cloudinaryPublicId as string
            secureUrl = result.docs[0].url as string
          }
        }
      }

      if (!publicId || !secureUrl) {
        console.log('No publicId or secureUrl found, returning 404')
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
          'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
          'Content-Length': response.headers.get('Content-Length') || '',
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
        const cloudinaryError =
          'message' in err.error ? err.error.message : JSON.stringify(err.error)

        console.log('Error fetching file from cloudinary, 404, message:', cloudinaryError)
        return new Response(null, { status: 404, statusText: 'Not Found' })
      }

      req.payload.logger.error({ err, msg: 'Unexpected error in staticHandler' })
      return new Response('Internal Server Error', { status: 500 })
    }
  }
}
