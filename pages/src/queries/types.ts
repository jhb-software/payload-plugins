import type {
  CollectionSlug,
  DefaultDocumentIDType,
  Payload,
  PayloadRequest,
  PopulateType,
  SelectType,
  Where,
} from 'payload'

import type { Locale } from '../types/Locale.js'

/** A page document returned by the path queries. */
export type PageDocument = { id: DefaultDocumentIDType } & Record<string, unknown>

/** Arguments shared by all path query functions. */
export type PagePathQueryArgs = {
  /**
   * Whether to use the KV path cache for this call.
   *
   * Overrides the `pathCache` plugin config option.
   */
  cache?: boolean

  /**
   * The page collections to search, in the given order.
   *
   * Defaults to all page collections registered with the plugin.
   */
  collections?: CollectionSlug[]

  /**
   * Whether to resolve draft documents.
   *
   * Draft and published lookups are cached under separate keys and never leak into each other.
   *
   * @default false
   */
  draft?: boolean

  /**
   * The locale to resolve the path in.
   *
   * Defaults to the locale prefix of the path (e.g. `/de/...`), falling back to the
   * default locale of the Payload config. Ignored for unlocalized configs.
   */
  locale?: Locale

  /**
   * Whether to bypass access control.
   *
   * Same default as Payload's Local API.
   *
   * @default true
   */
  overrideAccess?: boolean

  /** The path of the page to resolve (e.g. `/de/blog/my-post`). Must start with `/`. */
  path: string

  /**
   * The Payload instance. Required unless `req` is provided.
   *
   * When the plugin is configured with a `baseFilter` (e.g. a multi-tenant setup), `req` is
   * required instead, as the base filter is evaluated against the request.
   */
  payload?: Payload

  /**
   * The Payload request. Passing it forwards the active transaction, user and
   * request-scoped caches to all queries.
   *
   * Required when the plugin is configured with a `baseFilter`, so the filter (e.g. the
   * active tenant) can be evaluated against the request.
   */
  req?: PayloadRequest

  /**
   * An additional filter applied to all queries, on top of the plugin's configured
   * `baseFilter` (which scopes every lookup automatically, e.g. to a tenant). Both are part
   * of the cache key, so differently scoped lookups never share cache entries.
   *
   * The filtered fields must be queryable on every searched collection — restrict the
   * search via `collections` when the filter only applies to some page collections.
   */
  where?: Where
}

/** Arguments for {@link findPageByPath}. */
export type FindPageByPathArgs = {
  depth?: number
  populate?: PopulateType
  /**
   * The fields to select. The virtual `path` field is always included, as it is required
   * to verify the resolved document.
   */
  select?: SelectType
} & PagePathQueryArgs

/** The result of {@link findPageByPath}. */
export type PageDocumentResult<TDoc extends PageDocument = PageDocument> = {
  collection: CollectionSlug
  doc: TDoc
}
