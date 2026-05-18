import type { HandleUpload } from '@payloadcms/plugin-cloud-storage/types'
import type { UploadApiOptions, UploadApiResponse } from 'cloudinary'
import type stream from 'stream'

import { v2 as cloudinary } from 'cloudinary'
import fs from 'fs'

import { generatePublicId } from './utilities/generatePublicId.js'

type HandleUploadArgs = {
  collectionPrefix: string
  folderSrc: string
}

const multipartThreshold = 1024 * 1024 * 99 // 99MB

// Uploads the file to Cloudinary using a deterministic public_id derived from filename
// + collection prefix + folder. The persisted cloudinaryPublicId field is computed from
// those same inputs via a field-level beforeChange hook, so this function does not
// mutate `data` — it just performs the upload. Server-side uploads only; client uploads
// never reach here (upstream filters them out in afterChange, and the file is already
// in Cloudinary).
export const getHandleUpload = ({
  collectionPrefix,
  folderSrc,
}: HandleUploadArgs): HandleUpload => {
  return async ({ data, file }) => {
    const folder = folderSrc.replace(/\/$/, '')
    const uploadOptions: UploadApiOptions = {
      folder: folder || undefined,
      public_id: generatePublicId(collectionPrefix, file.filename),
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

    if (!(result && typeof result === 'object' && 'public_id' in result)) {
      throw new Error('No public_id in upload result from Cloudinary. Upload failed.')
    }

    return data
  }
}
