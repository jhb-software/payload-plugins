import type { CollectionAfterDeleteHook } from 'payload'

import { v2 as cloudinary } from 'cloudinary'
import { APIError } from 'payload'

/** Hooks which deletes the file from Cloudinary */
const afterDeleteHook: CollectionAfterDeleteHook = async ({ doc }) => {
  type ReturnType = {
    result?: 'not found' | 'ok'
  }

  let resource_type: 'image' | 'raw' | 'video' | undefined = undefined
  if (doc.mimeType?.startsWith('video/')) {
    // for videos, the resource_type must explicitly be set to 'video', otherwise Cloudinary will not find the file
    resource_type = 'video'
  }

  const result = (await cloudinary.uploader.destroy(doc.cloudinaryPublicId, {
    resource_type,
  })) as ReturnType

  if (result?.result === 'ok') {
    return doc
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

export default afterDeleteHook
