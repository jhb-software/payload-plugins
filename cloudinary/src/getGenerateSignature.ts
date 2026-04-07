import { v2 as cloudinary } from 'cloudinary'
import type { PayloadHandler, PayloadRequest, UploadCollectionSlug } from 'payload'
import { z, ZodError } from 'zod'

type Args = {
  access?: (args: {
    collectionSlug: UploadCollectionSlug
    req: PayloadRequest
  }) => boolean | Promise<boolean>
  apiSecret: string
}

const defaultAccess: Args['access'] = ({ req }) => !!req.user

const requestSchema = z.object({
  paramsToSign: z.record(z.string(), z.unknown()),
})

export { requestSchema as generateSignatureRequestSchema }

/**
 * This returns a Payload handler function that generates a signature of the file which the client can then sent to cloudinary together with the file.
 * It is only used when clientUploads is enabled.
 */
export const getGenerateSignature =
  ({ access = defaultAccess, apiSecret }: Args): PayloadHandler =>
  async (rawReq) => {
    try {
      if (!rawReq) {
        return Response.json({ error: 'No request provided' }, { status: 400 })
      }

      const req = rawReq

      const collectionSlug = req.searchParams.get('collectionSlug')

      if (!collectionSlug) {
        return Response.json({ error: 'Missing required query parameter: collectionSlug' }, { status: 400 })
      }

      if (!(await access({ collectionSlug, req }))) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const data = await req.json?.()
      const { paramsToSign } = requestSchema.parse(data)

      const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret)

      return Response.json({ signature })
    } catch (error) {
      if (error instanceof ZodError) {
        return Response.json(
          {
            details: error.issues.map((e) => ({
              message: e.message,
              path: e.path.join('.'),
            })),
            error: 'Validation failed',
          },
          { status: 400 },
        )
      }
      return Response.json(
        {
          error: `Signature generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
        { status: 500 },
      )
    }
  }
