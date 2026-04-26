import type { CollectionSlug, TextareaFieldValidation, Where } from 'payload'

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
  /**
   * Custom validate function for the alt text field on this collection.
   * When provided, it fully replaces the default validator (`validateAltText`).
   *
   * Use this to relax or extend the default — for example, to skip the
   * required-alt check when the request body does not touch `alt`
   * (folder moves, partial API updates).
   *
   * @example
   * ```typescript
   * import { validateAltText } from '@jhb.software/payload-alt-text-plugin'
   *
   * collections: [
   *   {
   *     slug: 'media',
   *     validate: (value, args) => {
   *       const { req } = args
   *       if (!req.data || !('alt' in req.data)) return true
   *       return validateAltText(value, args)
   *     },
   *   },
   * ]
   * ```
   */
  validate?: TextareaFieldValidation
}

export type NormalizedAltTextCollectionConfig = {
  mimeTypes: string[]
  slug: CollectionSlug
  validate?: TextareaFieldValidation
}

export type IncomingCollectionsConfig = (AltTextCollectionConfig | CollectionSlug)[]

export function normalizeCollectionsConfig(
  incoming: IncomingCollectionsConfig,
): NormalizedAltTextCollectionConfig[] {
  return incoming.map((entry) => {
    if (typeof entry === 'string') {
      return { slug: entry, mimeTypes: [...DEFAULT_TRACKED_MIME_TYPES] }
    }

    const normalized: NormalizedAltTextCollectionConfig = {
      slug: entry.slug,
      mimeTypes: entry.mimeTypes ? [...entry.mimeTypes] : [...DEFAULT_TRACKED_MIME_TYPES],
    }
    if (entry.validate) {
      normalized.validate = entry.validate
    }
    return normalized
  })
}

// Payload stores upload mimeType values as the lowercase MIME string (e.g. `image/png`).
// Pattern comparisons here are case-sensitive; callers should pass lowercase patterns.
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

/**
 * Builds a Payload `where` clause that matches documents whose `mimeType`
 * is in the given list of patterns. Returns `null` when nothing should match
 * (empty patterns), so callers can short-circuit the query.
 *
 * Wildcards like `image/*` are translated to a `like` (case-insensitive
 * substring) match on the prefix (`image/`). For valid MIME types this is
 * equivalent to a prefix match.
 */
export function buildMimeTypeWhere(patterns: readonly string[]): null | Where {
  if (patterns.length === 0) {
    return null
  }

  const exacts: string[] = []
  const wildcardPrefixes: string[] = []

  for (const pattern of patterns) {
    if (pattern.endsWith('/*')) {
      wildcardPrefixes.push(pattern.slice(0, -1))
    } else {
      exacts.push(pattern)
    }
  }

  const clauses: Where[] = []
  if (exacts.length > 0) {
    clauses.push({ mimeType: { in: exacts } })
  }
  for (const prefix of wildcardPrefixes) {
    clauses.push({ mimeType: { like: prefix } })
  }

  return clauses.length === 1 ? clauses[0] : { or: clauses }
}

/**
 * Default validation logic for the alt text field.
 *
 * - Allows an empty value during the initial upload (no regular update has occurred yet).
 * - Allows an empty value when the document's mime type is not tracked for alt text.
 * - Otherwise requires a non-empty value.
 *
 * Projects with stricter or looser requirements can pass a custom function to
 * a collection's `validate` option instead.
 */
export function validateAltText(
  value: Parameters<TextareaFieldValidation>[0],
  args: Parameters<TextareaFieldValidation>[1],
  trackedMimeTypes?: readonly string[],
): string | true {
  const data = (args.data ?? {}) as Record<string, unknown>
  const { operation, req } = args

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
    // @ts-expect-error - the translation key type does not include the custom key
    return req.t('@jhb.software/payload-alt-text-plugin:theAlternateTextIsRequired')
  }

  return true
}
