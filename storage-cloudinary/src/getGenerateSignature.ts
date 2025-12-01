import { v2 as cloudinary } from 'cloudinary'
import {
  APIError,
  Forbidden,
  type PayloadHandler,
  type PayloadRequest,
  type UploadCollectionSlug,
} from 'payload'

type Args = {
  access?: (args: {
    collectionSlug: UploadCollectionSlug
    req: PayloadRequest
  }) => boolean | Promise<boolean>
  apiSecret: string
}

const defaultAccess: Args['access'] = ({ req }) => !!req.user

/**
 * This returns a Payload handler function that generates a signature of the file which the client can then sent to cloudinary together with the file.
 * It is only used when clientUploads is enabled.
 */
export const getGenerateSignature =
  ({ access = defaultAccess, apiSecret }: Args): PayloadHandler =>
  async (rawReq) => {
    if (!rawReq) {
      return new Response(JSON.stringify({ error: 'No request provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const req = rawReq as PayloadRequest

    const collectionSlug = req.searchParams.get('collectionSlug')

    if (!collectionSlug) {
      throw new APIError('No payload was provided')
    }

    if (!(await access({ collectionSlug: collectionSlug as UploadCollectionSlug, req }))) {
      throw new Forbidden()
    }

    const body = await req.json?.()

    if (!body?.paramsToSign) {
      return new Response(JSON.stringify({ error: 'No paramsToSign provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const signature = cloudinary.utils.api_sign_request(body.paramsToSign, apiSecret)

    return new Response(JSON.stringify({ signature }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
