import type { UploadApiOptions, UploadApiResponse } from 'cloudinary'

import { v2 as cloudinary } from 'cloudinary'
import { randomUUID } from 'crypto'
import { Readable } from 'stream'
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

const state = vi.hoisted(() => ({
  destroys: [] as RecordedDestroy[],
  uploads: [] as RecordedUpload[],
}))

export const getRecordedUploads = (): RecordedUpload[] => [...state.uploads]
export const getRecordedDestroys = (): RecordedDestroy[] => [...state.destroys]

export const resetCloudinaryMock = () => {
  state.uploads.length = 0
  state.destroys.length = 0
}

const countBytes = async (input: Buffer | Readable | undefined): Promise<number> => {
  if (!input) {
    return 0
  }
  if (Buffer.isBuffer(input)) {
    return input.length
  }
  let bytes = 0
  for await (const chunk of input) {
    bytes += (chunk as Buffer).length
  }
  return bytes
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

  const fakeUploadStream = (
    options: UploadApiOptions,
    callback: (error: Error | undefined, result?: UploadApiResponse) => void,
  ) => ({
    end: (input?: Buffer | Readable) => {
      void countBytes(input).then(
        (bytes) => {
          state.uploads.push({ bytes, options })

          const publicId = resolvePublicId(options)
          const version = 1
          callback(undefined, {
            format: 'jpg',
            public_id: publicId,
            resource_type: 'image',
            secure_url: `https://res.cloudinary.com/demo/image/upload/v${version}/${publicId}.jpg`,
            signature: (actual.v2.utils.api_sign_request as unknown as SignRequest)(
              { public_id: publicId, version },
              process.env.CLOUDINARY_API_SECRET!,
              null,
              1,
            ),
            version,
          } as UploadApiResponse)
        },
        (error: Error) => callback(error),
      )
    },
  })

  const fakeDestroy = (
    publicId: string,
    options?: Record<string, unknown>,
    callback?: (error: unknown, result: { result: 'ok' }) => void,
  ) => {
    state.destroys.push({ options, publicId })
    const result = { result: 'ok' as const }
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
