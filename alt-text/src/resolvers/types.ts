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
  /** URL of the image thumbnail (must be publicly accessible) */
  imageUrl: string
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
  /** URL of the image thumbnail (must be publicly accessible) */
  imageUrl: string
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
 * Implement this to create custom resolvers for different AI providers.
 */
export type AltTextResolver = {
  /** Unique key identifying this resolver */
  key: string
  /** Generate alt text for a single image in one locale */
  resolve: (args: AltTextResolverArgs) => Promise<AltTextResolverResponse>
  /** Generate alt text for a single image in multiple locales (bulk operation) */
  resolveBulk: (args: AltTextBulkResolverArgs) => Promise<AltTextBulkResolverResponse>
}
