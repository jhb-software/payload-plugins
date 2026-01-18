/**
 * Generate a Cloudinary publicId, prepending the prefix to the filename (without extension).
 * @param prefix - String to prepend to the filename
 * @param fileName - Original file name (with extension)
 * @returns The generated publicId
 */
export function generatePublicId(prefix: string, fileName: string): string {
  return `${prefix}${fileName.replace(/\.[^/.]+$/, '')}`
}
