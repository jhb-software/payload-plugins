import type { CollectionSlug, Field, PayloadRequest, Where } from 'payload'

import type { AltTextResolver } from '../resolvers/types.js'
import type {
  AltTextCollectionConfig,
  IncomingCollectionsConfig,
  NormalizedAltTextCollectionConfig,
} from '../utilities/mimeTypes.js'

export type { AltTextCollectionConfig, NormalizedAltTextCollectionConfig }

/**
 * Builds the thumbnail URL the resolver fetches. Must be publicly reachable.
 *
 * May be async, so the URL can be signed on demand (S3 presigning, short-lived
 * CDN tokens).
 *
 * @param doc The upload document to build the URL for.
 * @param args.collection The slug of the collection `doc` belongs to — use it to
 * build different URLs per collection (e.g. a Cloudinary transformation for one
 * collection and a plain S3 URL for another).
 * @param args.req The request the generation runs under.
 */
export type GetImageThumbnail = (
  doc: Record<string, unknown>,
  args: { collection: CollectionSlug; req: PayloadRequest },
) => Promise<string> | string

/**
 * Narrows the health scan of one collection to a subset of its documents — in a
 * multi-tenant CMS, to the tenant the request is for. The returned constraint is
 * ANDed onto the scan's MIME type filter.
 *
 * Called once per configured collection, so collections that do not carry the
 * constraining field (a media library shared across tenants, say) can return `{}`
 * instead of being queried for a field they do not have.
 *
 * Return `{}` or `undefined` to scan the collection whole.
 *
 * @param args.collection The slug of the collection being scanned.
 * @param args.req The request the scan runs for.
 */
export type AltTextHealthBaseFilter = (args: {
  collection: CollectionSlug
  req: PayloadRequest
}) => Promise<undefined | Where> | undefined | Where

/** Configuration of the alt text health feature. */
export type AltTextHealthCheckConfig = {
  /**
   * Access control for the health report — both the REST endpoint and the dashboard
   * widget, which hides itself when this denies.
   *
   * Use it to restrict the collection-wide report more strictly than the
   * per-document generate endpoints (e.g. to admins).
   *
   * @default the plugin's `access`
   */
  access?: (args: { req: PayloadRequest }) => boolean | Promise<boolean>

  /**
   * Narrows what the report counts. See {@link AltTextHealthBaseFilter}.
   *
   * This is not access control: it scopes the aggregate, it does not decide who
   * may see it. Use `access` for that, and note the report is always filtered to
   * the collections the requesting user can read.
   */
  baseFilter?: AltTextHealthBaseFilter
}

/** Configuration options for the alt text plugin. */
export type IncomingAltTextPluginConfig = {
  /**
   * Custom access control for plugin endpoints.
   * Return `true` to allow access, `false` to deny.
   *
   * @default ({ req }) => !!req.user — requires authentication
   */
  access?: (args: { req: PayloadRequest }) => boolean | Promise<boolean>

  /**
   * Collections to enable the plugin for.
   *
   * Each entry may be a bare collection slug or an object with a `slug` and an
   * optional `mimeTypes` array restricting which MIME types are tracked,
   * validated, and generated. Bare slugs default to `['image/*']`.
   *
   * @example
   * ```typescript
   * collections: [
   *   'images', // shorthand — defaults to ['image/*']
   *   { slug: 'media', mimeTypes: ['image/*', 'application/pdf'] },
   * ]
   * ```
   */
  collections: IncomingCollectionsConfig

  /** Whether the plugin is enabled. */
  enabled?: boolean

  /** Override the default fields inserted by the plugin via a function that receives the default fields and returns the new fields */
  fieldsOverride?: (args: { defaultFields: Field[] }) => Field[]

  /**
   * Builds the image URL sent to the resolver. See {@link GetImageThumbnail}.
   *
   * @remarks
   * - Prefer a thumbnail/preview size over the original (e.g. from the sizes field)
   * - When the URL transcodes, declare the delivered format via
   *   `imageThumbnailMimeType` so source formats the resolver does not accept are
   *   not rejected
   */
  getImageThumbnail: GetImageThumbnail

  /**
   * Controls the alt text health feature (REST endpoint, cache revalidation hooks, and dashboard widget).
   *
   * - `false` disables the entire feature.
   * - `true` enables it, gated by `access` and covering every document.
   * - An object enables it and configures it. See {@link AltTextHealthCheckConfig}.
   *
   * @default true
   */
  healthCheck?: AltTextHealthCheckConfig | boolean

  /**
   * The MIME type `getImageThumbnail` delivers, for every configured collection.
   *
   * Declaring it takes a document's stored `mimeType` out of the decision of
   * whether alt text can be generated. Collections may override it or opt out with
   * `null` — see {@link AltTextCollectionConfig.imageThumbnailMimeType} for the
   * rationale and the `f_auto` caveat.
   *
   * @example 'image/webp'
   */
  imageThumbnailMimeType?: string

  /**
   * The locale to generate alt texts in when localization is disabled.
   *
   * Required when localization is disabled, ignored when localization is enabled.
   * @example 'en'
   */
  locale?: string

  /**
   * Maximum number of concurrent API requests for bulk generate operations.
   *
   * @default 16
   */
  maxBulkGenerateConcurrency?: number

  /**
   * Maximum number of image IDs accepted in a single bulk generate request.
   * Requests exceeding this are rejected with `400`. Duplicate IDs are collapsed
   * before the limit is applied, so each image counts once.
   *
   * Raise it for large libraries that need to process more images per request.
   *
   * @default 100
   */
  maxBulkGenerateIds?: number

  /** The resolver to use for generating alt text (e.g., openAIResolver) */
  resolver: AltTextResolver
}

/** Configuration of the alt text plugin after defaults have been applied. */
export type AltTextPluginConfig = {
  /** Access control for plugin endpoints. */
  access: (args: { req: PayloadRequest }) => boolean | Promise<boolean>

  /**
   * Collections with resolved MIME type filters and resolved delivered thumbnail
   * MIME types. The plugin-level `imageThumbnailMimeType` is folded into these
   * entries during normalization, so this is the only place to read it from.
   */
  collections: NormalizedAltTextCollectionConfig[]

  /** Whether the plugin is enabled. */
  enabled: boolean

  /** Override the default fields inserted by the plugin via a function that receives the default fields and returns the new fields */
  fieldsOverride?: (args: { defaultFields: Field[] }) => Field[]

  /** Function to get the thumbnail URL of an image document. */
  getImageThumbnail: GetImageThumbnail

  /** Whether alt text health tracking is enabled. */
  healthCheck: boolean

  /** Access control for the health endpoint. Defaults to `access`. */
  healthCheckAccess: (args: { req: PayloadRequest }) => boolean | Promise<boolean>

  /** Narrows what the health report counts. See {@link AltTextHealthBaseFilter}. */
  healthCheckBaseFilter?: AltTextHealthBaseFilter

  /** The locale to generate alt texts in when localization is disabled. */
  locale?: string

  /** The locales to generate alt texts for. */
  locales: string[]

  /** Maximum number of concurrent API requests for bulk generate operations. */
  maxBulkGenerateConcurrency: number

  /** Maximum number of image IDs accepted per bulk generate request. */
  maxBulkGenerateIds: number

  /** The resolver to use for generating alt text */
  resolver: AltTextResolver
}
