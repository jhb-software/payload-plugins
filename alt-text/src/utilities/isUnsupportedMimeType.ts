const UNSUPPORTED_MIME_TYPES = ['image/svg+xml']

/**
 * Checks whether a file's MIME type is unsupported for alt text generation.
 * SVGs are vector-based XML files that cannot be analyzed by vision AI models.
 */
export function isUnsupportedMimeType(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false
  return UNSUPPORTED_MIME_TYPES.includes(mimeType)
}
