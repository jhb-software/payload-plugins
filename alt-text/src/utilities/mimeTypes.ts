import type { CollectionSlug, TextareaFieldValidation, Where } from 'payload'

export const DEFAULT_TRACKED_MIME_TYPES: readonly string[] = ['image/*']

export type AltTextCollectionConfig = {
  /**
   * The MIME type `getImageThumbnail` delivers for documents in this collection.
   *
   * The resolver only receives the bytes at that URL, never the stored file. When
   * the URL transcodes (e.g. a Cloudinary `f_webp` transformation), the stored
   * `mimeType` says nothing about what arrives, so AVIF and HEIC uploads are
   * rejected on their source format even though the delivered bytes are fine.
   *
   * Declaring the delivered format replaces that per-document source check, and
   * passes the type to the resolver as `imageThumbnailMimeType`. Which source
   * formats get alt text at all is still governed by `mimeTypes`.
   *
   * Only declare a format the transform *always* produces. An `f_auto`-style
   * transformation negotiates via the client's `Accept` header and may return the
   * source format, so leave this unset there.
   *
   * Validated at config load — for syntax, and against the resolver's
   * `supportedMimeTypes` when it declares any.
   *
   * Falls back to the plugin-level option of the same name; `null` opts out of it.
   *
   * @example 'image/webp'
   */
  imageThumbnailMimeType?: null | string
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
  /**
   * The delivered thumbnail MIME type in effect for this collection, after the
   * plugin-level default has been applied. Absent when the collection opted out
   * (`null`) or neither level declared one.
   */
  imageThumbnailMimeType?: string
  mimeTypes: string[]
  slug: CollectionSlug
  validate?: TextareaFieldValidation
}

export type IncomingCollectionsConfig = (AltTextCollectionConfig | CollectionSlug)[]

export function normalizeCollectionsConfig(
  incoming: IncomingCollectionsConfig,
  defaults?: { imageThumbnailMimeType?: string },
): NormalizedAltTextCollectionConfig[] {
  const defaultThumbnailMimeType = defaults?.imageThumbnailMimeType

  return incoming.map((entry) => {
    if (typeof entry === 'string') {
      return {
        slug: entry,
        mimeTypes: [...DEFAULT_TRACKED_MIME_TYPES],
        ...(typeof defaultThumbnailMimeType === 'string' && {
          imageThumbnailMimeType: defaultThumbnailMimeType,
        }),
      }
    }

    const normalized: NormalizedAltTextCollectionConfig = {
      slug: entry.slug,
      mimeTypes: entry.mimeTypes ? [...entry.mimeTypes] : [...DEFAULT_TRACKED_MIME_TYPES],
    }

    // `undefined` inherits the plugin-level default, `null` explicitly opts out of
    // it. Resolving with `??` would silently collapse those two into "inherit".
    const thumbnailMimeType =
      entry.imageThumbnailMimeType !== undefined
        ? entry.imageThumbnailMimeType
        : defaultThumbnailMimeType
    // Only `null` (opt-out) and an absent declaration drop the key. An empty
    // string is kept so config-load validation rejects it, rather than it
    // silently degrading into "nothing declared".
    if (typeof thumbnailMimeType === 'string') {
      normalized.imageThumbnailMimeType = thumbnailMimeType
    }

    if (entry.validate) {
      normalized.validate = entry.validate
    }
    return normalized
  })
}

/** `type/subtype`, per RFC 6838's restricted-name grammar, lowercase. */
const MIME_TYPE_PATTERN = /^[a-z]+\/[a-z0-9][a-z0-9!#$&^_.+-]*$/

/**
 * Whether a declared `imageThumbnailMimeType` is syntactically a MIME type.
 *
 * Checked independently of the resolver's `supportedMimeTypes`: declaring a type
 * switches off the per-document source check, so a typo that booted cleanly would
 * remove the guard while declaring nothing.
 */
export function isValidMimeType(value: string): boolean {
  return MIME_TYPE_PATTERN.test(value)
}

/**
 * Whether a document's stored `mimeType` blocks alt text generation. Returns the
 * error message when it does, `null` when generation may proceed.
 *
 * The stored type is only a proxy — the resolver receives the bytes at the
 * thumbnail URL, not the stored file. A collection that declares what its URL
 * delivers settles support at config load, making the source format irrelevant.
 */
export function getUnsupportedSourceMimeTypeError({
  declaredThumbnailMimeType,
  mimeType,
  supportedMimeTypes,
}: {
  declaredThumbnailMimeType?: string
  mimeType?: string
  supportedMimeTypes?: readonly string[]
}): null | string {
  if (declaredThumbnailMimeType || !mimeType || !supportedMimeTypes) {
    return null
  }

  if (supportedMimeTypes.includes(mimeType)) {
    return null
  }

  return `Alt text generation is not supported for files of type "${mimeType}". Supported types: ${supportedMimeTypes.join(', ')}.`
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
