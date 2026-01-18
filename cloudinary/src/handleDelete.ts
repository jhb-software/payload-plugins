import type { HandleDelete } from '@payloadcms/plugin-cloud-storage/types'

import { v2 as cloudinary } from 'cloudinary'
import { APIError } from 'payload'

export const getHandleDelete = (): HandleDelete => {
  return async ({ doc }) => {
    if (
      !('cloudinaryPublicId' in doc) ||
      !doc.cloudinaryPublicId ||
      !('mimeType' in doc) ||
      !doc.mimeType ||
      typeof doc.mimeType !== 'string' ||
      typeof doc.cloudinaryPublicId !== 'string'
    ) {
      throw new APIError('File is missing a cloudinaryPublicId or mimeType', 500)
    }

    type DestroyReturnType = {
      result?: 'not found' | 'ok'
    }

    const result = (await cloudinary.uploader.destroy(doc.cloudinaryPublicId, {
      resource_type: doc.mimeType.startsWith('video')
        ? 'video'
        : doc.mimeType.startsWith('image')
          ? 'image'
          : undefined,
    })) as DestroyReturnType

    if (result?.result === 'ok') {
      return
    } else if (result?.result === 'not found') {
      throw new APIError(
        'File to delete not found in Cloudinary', // message
        500, // status
        result, // data
        true, // isPublic
      )
    } else {
      throw new APIError(
        'Error deleting file from Cloudinary', // message
        500, // status
        result, // data
        true, // isPublic
      )
    }
  }
}
