import type { UploadApiOptions, UploadApiResponse } from 'cloudinary'

import { v2 as cloudinary } from 'cloudinary'
import { randomUUID } from 'crypto'
import { Writable } from 'stream'
import { vi } from 'vitest'

/**
 * Replaces the network-bound parts of the Cloudinary SDK (`uploader.*`) with an in-memory fake
 * that records every call. Everything else, notably `utils.api_sign_request`, stays real so
 * signatures computed by the plugin and by the tests match what Cloudinary would compute.
 *
 * Registered as a vitest setup file, so the mock is in place before the Payload config (and with
 * it the plugin) is imported.
 */

export type RecordedUpload = {
  bytes: number
  options: UploadApiOptions
}

export type RecordedDestroy = {
  options: Record<string, unknown> | undefined
  publicId: string
}

/** `api_sign_request` also takes an algorithm and signature version, which the SDK typings omit. */
type SignRequest = (
  params: Record<string, unknown>,
  apiSecret: string,
  signatureAlgorithm: null,
  signatureVersion: number,
) => string

/**
 * Signs `{ public_id, version }` the way Cloudinary signs its upload responses (signature
 * version 1), using the real SDK.
 */
export const signCloudinaryResponse = ({
  publicId,
  version,
}: {
  publicId: string
  version: number
}): string =>
  (cloudinary.utils.api_sign_request as unknown as SignRequest)(
    { public_id: publicId, version },
    process.env.CLOUDINARY_API_SECRET!,
    null,
    1,
  )

/**
 * Plays Cloudinary's part of a signed browser upload: rejects the request unless `signature`
 * matches the upload parameters, stores the asset under `folder/public_id` (as Cloudinary does
 * when both are sent), and answers with a response signed over `{ public_id, version }`.
 */
export const fakeSignedBrowserUpload = ({
  params,
  signature,
}: {
  params: Record<string, number | string | undefined>
  signature: string
}): {
  format: string
  public_id: string
  resource_type: string
  signature: string
  version: number
} => {
  const signedParams = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined),
  )
  const expected = (cloudinary.utils.api_sign_request as unknown as SignRequest)(
    signedParams,
    process.env.CLOUDINARY_API_SECRET!,
    null,
    2,
  )
  if (signature !== expected) {
    throw new Error('Invalid Signature')
  }

  const folder = typeof params.folder === 'string' ? params.folder : ''
  const publicId = folder ? `${folder}/${String(params.public_id)}` : String(params.public_id)
  const version = 1
  return {
    format: 'jpg',
    public_id: publicId,
    resource_type: 'image',
    signature: signCloudinaryResponse({ publicId, version }),
    version,
  }
}

const state = vi.hoisted(() => ({
  /** Delivery type by public id of every asset uploaded through the SDK. */
  assetTypes: new Map<string, string>(),
  destroys: [] as RecordedDestroy[],
  uploads: [] as RecordedUpload[],
}))

export const getRecordedUploads = (): RecordedUpload[] => [...state.uploads]
export const getRecordedDestroys = (): RecordedDestroy[] => [...state.destroys]
/** Public ids of the assets uploaded through the SDK that have not been destroyed. */
export const getStoredAssets = (): string[] => [...state.assetTypes.keys()]

export const resetCloudinaryMock = () => {
  state.uploads.length = 0
  state.destroys.length = 0
  state.assetTypes.clear()
}

vi.mock('cloudinary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('cloudinary')>()

  /** Mirrors how Cloudinary composes the stored public id from the `folder` and `public_id` options. */
  const resolvePublicId = (options: UploadApiOptions): string => {
    const id = typeof options.public_id === 'string' ? options.public_id : randomUUID()
    const folder =
      typeof options.folder === 'string' ? options.folder.replace(/^\/+|\/+$/g, '') : ''
    return folder ? `${folder}/${id}` : id
  }

  /**
   * Like the SDK's `upload_stream`, returns a real Writable: it accepts written or piped chunks
   * and rejects anything else (e.g. `.end(readStream)`) the way Node does.
   */
  const fakeUploadStream = (
    options: UploadApiOptions,
    callback: (error: Error | undefined, result?: UploadApiResponse) => void,
  ) => {
    let bytes = 0
    return new Writable({
      final(done) {
        state.uploads.push({ bytes, options })

        const publicId = resolvePublicId(options)
        state.assetTypes.set(publicId, options.type ?? 'upload')
        const version = 1
        callback(undefined, {
          format: 'jpg',
          public_id: publicId,
          resource_type: 'image',
          // Like Cloudinary, answers with a signed URL for authenticated assets.
          secure_url: actual.v2.url(publicId, {
            cloud_name: 'demo',
            format: 'jpg',
            resource_type: 'image',
            secure: true,
            sign_url: options.type === 'authenticated',
            type: options.type ?? 'upload',
            urlAnalytics: false,
            version,
          }),
          signature: (actual.v2.utils.api_sign_request as unknown as SignRequest)(
            { public_id: publicId, version },
            process.env.CLOUDINARY_API_SECRET!,
            null,
            1,
          ),
          version,
        } as UploadApiResponse)
        done()
      },
      write(chunk: Buffer, _encoding, done) {
        bytes += chunk.length
        done()
      },
    })
  }

  const fakeDestroy = (
    publicId: string,
    options?: Record<string, unknown>,
    callback?: (error: unknown, result: { result: 'not found' | 'ok' }) => void,
  ) => {
    state.destroys.push({ options, publicId })
    // Cloudinary addresses assets by public id and delivery type, so destroying an asset under
    // another type finds nothing.
    const storedType = state.assetTypes.get(publicId)
    const result = {
      result:
        storedType && storedType !== (options?.type ?? 'upload')
          ? ('not found' as const)
          : ('ok' as const),
    }
    if (result.result === 'ok') {
      state.assetTypes.delete(publicId)
    }
    callback?.(undefined, result)
    return Promise.resolve(result)
  }

  const v2 = {
    ...actual.v2,
    uploader: {
      ...actual.v2.uploader,
      destroy: fakeDestroy,
      upload_chunked_stream: fakeUploadStream,
      upload_stream: fakeUploadStream,
    },
  }

  return { ...actual, default: { ...actual, v2 }, v2 }
})
