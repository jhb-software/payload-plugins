import type { CollectionSlug } from 'payload'

export const DEFAULT_TRACKED_MIME_TYPES: readonly string[] = ['image/*']

export type AltTextCollectionConfig = {
  /**
   * MIME types for which alt text is tracked, validated, and generated in this collection.
   *
   * Accepts exact MIME types (e.g. `image/png`) or wildcards (e.g. `image/*`).
   * For documents whose mime type does not match, the alt text field is hidden,
   * its validation is skipped, and the document is excluded from the health widget.
   *
   * @default ['image/*']
   */
  mimeTypes?: string[]
  /** Collection slug to enable the plugin for. */
  slug: CollectionSlug
}

export type NormalizedAltTextCollectionConfig = {
  mimeTypes: string[]
  slug: CollectionSlug
}

export type IncomingCollectionsConfig = (AltTextCollectionConfig | CollectionSlug)[]

export function normalizeCollectionsConfig(
  incoming: IncomingCollectionsConfig,
): NormalizedAltTextCollectionConfig[] {
  return incoming.map((entry) => {
    if (typeof entry === 'string') {
      return { slug: entry, mimeTypes: [...DEFAULT_TRACKED_MIME_TYPES] }
    }

    return {
      slug: entry.slug,
      mimeTypes: entry.mimeTypes ? [...entry.mimeTypes] : [...DEFAULT_TRACKED_MIME_TYPES],
    }
  })
}

export function matchesMimeType(mimeType: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern === mimeType) {
      return true
    }
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -1)
      return mimeType.startsWith(prefix)
    }
    return false
  })
}

export function filterDocsByMimeType<T extends { mimeType?: unknown }>(
  docs: T[],
  patterns: readonly string[],
): T[] {
  return docs.filter((doc) => {
    const mimeType = typeof doc.mimeType === 'string' ? doc.mimeType : undefined
    if (!mimeType) {
      return false
    }
    return matchesMimeType(mimeType, patterns)
  })
}

type TFunction = (key: string) => string

type ValidateAltTextArgs = {
  data: Record<string, unknown>
  operation: string
  req: { t: TFunction }
}

/**
 * Shared validation logic for the alt text field.
 *
 * - Allows an empty value during the initial upload (no regular update has occurred yet).
 * - Allows an empty value when the document's mime type is not tracked for alt text.
 * - Otherwise requires a non-empty value.
 */
export function validateAltText(
  value: unknown,
  { data, operation, req: { t } }: ValidateAltTextArgs,
  trackedMimeTypes?: readonly string[],
): string | true {
  // Since https://github.com/payloadcms/payload/pull/14988, when using external storage (e.g., S3),
  // it is no longer possible to detect whether this validation runs during the initial upload
  // or a regular update by checking the existence of the ID.
  // Instead, compare the timestamps of the createdAt and updatedAt fields.
  const isInitialUpload =
    operation === 'create' ||
    ('createdAt' in data && 'updatedAt' in data && data.createdAt === data.updatedAt)

  if (isInitialUpload) {
    return true
  }

  if (trackedMimeTypes && trackedMimeTypes.length > 0) {
    const mimeType = typeof data.mimeType === 'string' ? data.mimeType : undefined
    if (!mimeType || !matchesMimeType(mimeType, trackedMimeTypes)) {
      return true
    }
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return t('@jhb.software/payload-alt-text-plugin:theAlternateTextIsRequired')
  }

  return true
}
