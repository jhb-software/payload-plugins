/**
 * Characters Cloudinary does not allow in a public id. Cloudinary replaces them with underscores
 * when deriving an id from a filename; doing the same here keeps the id the browser signs, the id
 * Cloudinary stores, and the id the confirm endpoint expects identical.
 */
const disallowedPublicIdCharacters = /[?&#\\%<>+]/g

/**
 * Generate a Cloudinary publicId, prepending the prefix to the filename (without extension).
 * @param prefix - String to prepend to the filename
 * @param fileName - Original file name (with extension)
 * @returns The generated publicId
 */
export function generatePublicId(prefix: string, fileName: string): string {
  return `${prefix}${fileName.replace(/\.[^/.]+$/, '').replace(disallowedPublicIdCharacters, '_')}`
}
