import type { HandleUpload } from '@payloadcms/plugin-cloud-storage/types'
import type { UploadApiOptions, UploadApiResponse } from 'cloudinary'
import type stream from 'stream'

import { v2 as cloudinary } from 'cloudinary'
import fs from 'fs'

import { generatePublicId } from './utilities/generatePublicId.js'

type HandleUploadArgs = {
  folderSrc: string
  prefix?: string
  useFilename?: boolean
}

const multipartThreshold = 1024 * 1024 * 99 // 99MB

// Client uploads never reach this handler; @payloadcms/plugin-cloud-storage 3.82+ skips it
// for files with a clientUploadContext. Persistence for that path lives in the beforeChange
// hook registered in src/index.ts.
export const getHandleUpload = ({
  folderSrc,
  prefix = '',
  useFilename,
}: HandleUploadArgs): HandleUpload => {
  return async ({ data, file }) => {
    const uploadOptions: UploadApiOptions = {
      folder: folderSrc,
      public_id: useFilename ? generatePublicId(prefix, file.filename) : undefined,
      resource_type: 'auto',
    }

    const fileBufferOrStream: Buffer | stream.Readable = file.tempFilePath
      ? fs.createReadStream(file.tempFilePath)
      : file.buffer

    async function uploadStream(): Promise<UploadApiResponse> {
      if (file.buffer.length > 0 && file.buffer.length < multipartThreshold) {
        return await new Promise((resolve, reject) => {
          cloudinary.uploader
            .upload_stream(uploadOptions, (error, result) => {
              if (error) {
                reject(new Error(`Upload error: ${error.message}`))
              }

              resolve(result!)
            })
            .end(fileBufferOrStream)
        })
      } else {
        return await new Promise((resolve, reject) => {
          cloudinary.uploader
            .upload_chunked_stream(uploadOptions, (error, result) => {
              if (error) {
                reject(new Error(`Chunked upload error: ${error.message}`))
              }

              resolve(result!)
            })
            .end(fileBufferOrStream)
        })
      }
    }

    const result = await uploadStream()

    if (result && typeof result === 'object' && 'public_id' in result && 'secure_url' in result) {
      // these fields will be stored in the database
      data.cloudinaryPublicId = result.public_id
      data.url = result.secure_url

      return data
    } else {
      throw new Error('No public_id in upload result from Cloudinary. Upload failed.')
    }
  }
}
