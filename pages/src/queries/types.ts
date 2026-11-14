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

/** The result of a path cache lookup, reported via {@link FindPageByPathArgs.onCacheResult}. */
export type PathCacheLookupResult = {
  /** The KV key the lookup used. */
  cacheKey: string
  /** The normalized path that was looked up. */
  path: string
  /**
   * - `hit` — the cached entry resolved and verified against the requested path.
   * - `stale` — an entry existed but no longer resolved (page renamed, moved, unpublished,
   *   deleted, or an unusable entry); the lookup fell back to the scan.
   * - `miss` — no entry existed for the key.
   */
  status: 'hit' | 'miss' | 'stale'
}

/** A page document returned by {@link findPageByPath}. */
export type PageDocument = { id: DefaultDocumentIDType } & Record<string, unknown>

/** Arguments for {@link findPageByPath}. */
export type FindPageByPathArgs = {
  /**
   * Whether to use the KV path cache for this call.
   *
   * @default true
   */
  cache?: boolean

  /** The depth to which related documents are populated in the resolved document. */
  depth?: number

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
   * Called with the status of the path cache lookup (`hit` / `stale` / `miss`), e.g. to log
   * or count cache effectiveness. Not called when the cache is disabled via `cache: false`.
   */
  onCacheResult?: (result: PathCacheLookupResult) => void

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

  /** How related documents are populated in the resolved document. */
  populate?: PopulateType

  /**
   * The Payload request. Passing it forwards the active transaction, user and
   * request-scoped caches to all queries.
   *
   * Required when the plugin is configured with a `baseFilter`, so the filter (e.g. the
   * active tenant) can be evaluated against the request.
   */
  req?: PayloadRequest

  /**
   * The fields to select. The virtual `path` field is always included, as it is required
   * to verify the resolved document.
   */
  select?: SelectType

  /**
   * Defers cache maintenance writes (the write-back after a scan and the deletion of stale
   * entries) instead of blocking the lookup on them. KV writes can be slow (hundreds of
   * milliseconds on some stores), and the resolved document never depends on them.
   *
   * On serverless runtimes a deferred promise must be registered with the platform or it may
   * be cancelled when the response ends — pass the runtime's scheduler here: `waitUntil` from
   * `@vercel/functions` on Vercel, or `ctx.waitUntil` (bound to its context) on Cloudflare
   * Workers. Without it, writes stay on the critical path.
   */
  waitUntil?: (promise: Promise<unknown>) => void

  /**
   * An additional filter applied to all queries, on top of the plugin's configured
   * `baseFilter` (which scopes every lookup automatically, e.g. to a tenant). Both are part
   * of the cache key, so differently scoped lookups never share cache entries.
   *
   * The filtered fields must be queryable on every page collection.
   */
  where?: Where
}

/** The result of {@link findPageByPath}. */
export type PageDocumentResult<TDoc extends PageDocument = PageDocument> = {
  collection: CollectionSlug
  doc: TDoc
}
