import type { HandleUpload } from '@payloadcms/plugin-cloud-storage/types'
import { v2 as cloudinary, UploadApiOptions, UploadApiResponse } from 'cloudinary'
import fs from 'fs'
import type stream from 'stream'

type HandleUploadArgs = {
  prefix?: string
  folderSrc: string
}

const multipartThreshold = 1024 * 1024 * 99 // 99MB

export const getHandleUpload = ({ folderSrc, prefix = '' }: HandleUploadArgs): HandleUpload => {
  return async ({ data, file }) => {
    // TODO: this function is also called when the document is updated (e.g. chaging the alt text)
    // In this case do not re-upload the file
    // But attention: the file inside the document could be updated, in this case we want to re-upload the file
    // Therefore returning early if the cloudinaryPublicId is present on the data (document) is not enough

    const publicId = `${prefix}${file.filename.replace(/\.[^/.]+$/, '')}` // prepend prefix to filename and remove file extension

    const uploadOptions: UploadApiOptions = {
      folder: folderSrc,
      public_id: publicId,
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
      data.cloudinarySecureUrl = result.secure_url

      return data
    } else {
      throw new Error('No public_id in upload result')
    }
  }
}
