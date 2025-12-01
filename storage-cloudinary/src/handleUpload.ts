import type { HandleUpload } from '@payloadcms/plugin-cloud-storage/types'
import type { UploadApiOptions, UploadApiResponse } from 'cloudinary';
import type stream from 'stream'

import { v2 as cloudinary } from 'cloudinary'
import fs from 'fs'

import type { ClientUploadContext } from './client/CloudinaryClientUploadHandler.js'

import { generatePublicId } from './utilities/generatePublicId.js'

type HandleUploadArgs = {
  folderSrc: string
  prefix?: string
  useFilename?: boolean
}

const multipartThreshold = 1024 * 1024 * 99 // 99MB

export const getHandleUpload = ({
  folderSrc,
  prefix = '',
  useFilename,
}: HandleUploadArgs): HandleUpload => {
  return async ({ data, file }) => {
    const clientUploadContext = file.clientUploadContext as ClientUploadContext | undefined

    // If the file was already uploaded from the client, add the publicId and secureUrl to the data object and return it
    if (clientUploadContext) {
      data.cloudinaryPublicId = clientUploadContext.publicId
      data.url = clientUploadContext.secureUrl

      return data
    }

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
      data.cloudinaryPublicId = result.public_id
      // TODO: find out if the URL should be stored in the DB or generated in the generateURL function?
      // It looks like the official s3 plugin does not store it in the DB initially, but it gets stored after the first update...
      data.url = result.secure_url

      return data
    } else {
      throw new Error('No public_id in upload result from Cloudinary. Upload failed.')
    }
  }
}
