import { v2 as cloudinary, UploadApiOptions, UploadApiResponse, UploadStream } from 'cloudinary'
import type { PayloadRequest } from 'payload'
import { Readable } from 'stream'
import { CloudinaryPluginConfig } from '../types/CloudinaryPluginConfig'

type File = NonNullable<PayloadRequest['file']>

export const streamUpload =
  (pluginConfig: CloudinaryPluginConfig) =>
  (file: File, id?: string): Promise<UploadApiResponse> => {
    const readStream = Readable.from(file.data)

    return new Promise<UploadApiResponse>((resolve, reject) => {
      const options: UploadApiOptions = {
        // @ts-ignore
        folder: pluginConfig.cloudinary.folder,
        chunk_size: pluginConfig.uploadOptions?.chunkSize,
        ...(pluginConfig.uploadOptions?.useFilename && {
          use_filename: true,
          filename_override: file.name,
        }),

        invalidate: true,
        resource_type: 'auto',

        // In case of updating the image, the public_id will be needed,
        // but not the folder as it's already in the URL and if we pass
        // the value then it will create file in sub-folder instead of updating.
        ...(id && { public_id: id, folder: null }),
      }

      const stream: UploadStream = cloudinary.uploader.upload_stream(options, (error, result) =>
        result ? resolve(result) : reject(error),
      )

      readStream.pipe(stream)
    })
  }
