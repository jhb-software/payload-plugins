import type { PayloadRequest } from 'payload'

/**
 * Result of generating alt text for a single image.
 */
export type AltTextResult = {
  /** Concise descriptive alt text (1-2 sentences) */
  altText: string
  /** Keywords describing the image content */
  keywords: string[]
}

/**
 * Arguments passed to the resolver for single image generation.
 */
export type AltTextResolverArgs = {
  /** Optional filename for additional context */
  filename?: string
  /**
   * The format served at `imageThumbnailUrl`, when the collection declares one
   * via `imageThumbnailMimeType`.
   *
   * Resolvers that pass the URL to the provider can ignore this. Resolvers that
   * inline the bytes need it: Anthropic image blocks require an explicit
   * `media_type` and Gemini's `inline_data` requires a `mime_type`, neither of
   * which can be sniffed from a URL. Undefined when nothing was declared.
   */
  imageThumbnailMimeType?: string
  /** URL of the image thumbnail (must be publicly accessible) */
  imageThumbnailUrl: string
  /** Target locale for the generated alt text */
  locale: string
  /** Payload request object for logging */
  req: PayloadRequest
}

/**
 * Arguments passed to the resolver for bulk/multi-locale generation.
 */
export type AltTextBulkResolverArgs = {
  /** Optional filename for additional context */
  filename?: string
  /**
   * The format served at `imageThumbnailUrl`, when the collection declares one
   * via `imageThumbnailMimeType`. See {@link AltTextResolverArgs.imageThumbnailMimeType}.
   */
  imageThumbnailMimeType?: string
  /** URL of the image thumbnail (must be publicly accessible) */
  imageThumbnailUrl: string
  /** Target locales for the generated alt texts */
  locales: string[]
  /** Payload request object for logging */
  req: PayloadRequest
}

/**
 * Response from single image alt text generation.
 */
export type AltTextResolverResponse =
  | { error?: string; success: false }
  | { result: AltTextResult; success: true }

/**
 * Response from bulk/multi-locale alt text generation.
 */
export type AltTextBulkResolverResponse =
  | { error?: string; success: false }
  | { results: Record<string, AltTextResult>; success: true }

/**
 * Alt text resolver interface.
 * Implement this to create custom resolvers for different providers.
 */
export type AltTextResolver = {
  /** Unique key identifying this resolver */
  key: string
  /** Generate alt text for a single image in one locale */
  resolve: (args: AltTextResolverArgs) => Promise<AltTextResolverResponse>
  /** Generate alt text for a single image in multiple locales (bulk operation) */
  resolveBulk: (args: AltTextBulkResolverArgs) => Promise<AltTextBulkResolverResponse>
  /**
   * MIME types this resolver can process, i.e. the formats the provider accepts
   * for the bytes served at `imageThumbnailUrl`.
   *
   * When set, the endpoints reject documents whose stored `mimeType` is not in
   * this list — a conservative proxy, since the resolver never sees the stored
   * file. Projects whose `getImageThumbnail` transcodes should declare the
   * delivered format via the plugin's `imageThumbnailMimeType` option, which
   * replaces that proxy check with a one-time validation against this list.
   */
  supportedMimeTypes?: string[]
}
