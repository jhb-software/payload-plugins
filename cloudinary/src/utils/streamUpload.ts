import type { UploadApiOptions, UploadApiResponse, UploadStream } from 'cloudinary'
import type { PayloadRequest } from 'payload'

import { v2 as cloudinary } from 'cloudinary'
import { Readable } from 'stream'

import type { CloudinaryPluginConfig } from '../types/CloudinaryPluginConfig'

type File = NonNullable<PayloadRequest['file']>

export const streamUpload =
  (pluginConfig: CloudinaryPluginConfig) =>
  (file: File, id?: string): Promise<UploadApiResponse> => {
    const readStream = Readable.from(file.data)

    return new Promise<UploadApiResponse>((resolve, reject) => {
      const options: UploadApiOptions = {
        chunk_size: pluginConfig.uploadOptions?.chunkSize,
        folder: pluginConfig.cloudinary.folder,
        ...(pluginConfig.uploadOptions?.useFilename && {
          filename_override: file.name,
          use_filename: true,
        }),

        invalidate: true,
        resource_type: 'auto',

        // In case of updating the image, the public_id will be needed,
        // but not the folder as it's already in the URL and if we pass
        // the value then it will create file in sub-folder instead of updating.
        ...(id && { folder: undefined, public_id: id }),
      }

      const stream: UploadStream = cloudinary.uploader.upload_stream(options, (error, result) =>
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        result ? resolve(result) : reject(error),
      )

      readStream.pipe(stream)
    })
  }
