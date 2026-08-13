import type { CollectionConfig, CollectionSlug, PayloadRequest, SelectType } from 'payload'

import type { Locale } from '../types/Locale.js'
import type { PageCollectionConfigAttributes } from '../types/PageCollectionConfigAttributes.js'

import { asPageCollectionConfig } from './pageCollectionConfigHelpers.js'

/** Document ids are numbers on SQL adapters and strings on MongoDB. */
type DocumentID = number | string

/**
 * An ancestor document reduced to the values the breadcrumb assembly needs.
 *
 * `label` and `slug` hold the raw database values: localized fields are locale-keyed
 * objects (`{ de: 'x', en: 'y' }`), unlocalized ones plain values.
 */
export type Ancestor = {
  collection: CollectionSlug
  id: DocumentID
  isRootPage: boolean
  label: unknown
  slug: unknown
}

type AncestorRow = {
  parentCollection: CollectionSlug
  parentId: DocumentID | null
} & Ancestor

type Batch = {
  ids: DocumentID[]
  promise: Promise<Map<string, AncestorRow>>
  reject: (error: unknown) => void
  resolve: (rows: Map<string, AncestorRow>) => void
}

const CACHE_KEY = 'pagesPluginAncestorCache'
const BATCH_KEY = 'pagesPluginAncestorBatches'

/**
 * Loads the ancestor chain of a document, ordered top-down (root first).
 *
 * Ancestors are read straight from the database adapter instead of through the Local API, so
 * none of the ancestor collections' hooks run: a user hook on a page collection is executed
 * once for the document that was actually requested, never once more per level of the page
 * tree. Only the fields the path and breadcrumbs are built from are selected, resolved from
 * each ancestor collection's own page config, which keeps chains that cross collections
 * (e.g. blogposts → pages) working.
 *
 * Access control is intentionally not applied: breadcrumbs of a readable document must not
 * change based on who may read its ancestors (the previous implementation passed
 * `overrideAccess: true` for the same reason).
 */
export async function loadAncestorChain({
  id,
  collection,
  docId,
  locale,
  req,
}: {
  /** Collection of the first ancestor (the parent of the document the chain is built for). */
  collection: CollectionSlug
  /** Id of the document the chain is built for, used for error messages. */
  docId: unknown
  /** Id of the first ancestor. */
  id: DocumentID
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  locale: 'all' | Locale | undefined
  req: PayloadRequest
}): Promise<Ancestor[]> {
  const chain: Ancestor[] = []
  const visited: string[] = []
  let childId: unknown = docId
  let next: { collection: CollectionSlug; id: DocumentID } | null = { id, collection }

  while (next) {
    const key = `${next.collection}:${next.id}`

    if (visited.includes(key)) {
      throw new Error(
        `[Pages Plugin] Circular parent reference detected while resolving the ancestors of document ${String(docId)}: ${[...visited, key].join(' -> ')}`,
      )
    }
    visited.push(key)

    const row = await loadAncestor({ id: next.id, collection: next.collection, locale, req })

    if (!row) {
      // This can be the case, when the parent document got deleted.
      throw new Error(
        'Parent document with id ' +
          String(next.id) +
          ' of document with id ' +
          String(childId) +
          ' not found.',
      )
    }

    chain.unshift(row)
    childId = row.id
    next = row.parentId === null ? null : { id: row.parentId, collection: row.parentCollection }
  }

  return chain
}

/**
 * Loads a single ancestor, batched and cached on the request context.
 *
 * The cache stores Promises rather than resolved values, so concurrent `beforeRead` hooks (all
 * documents of a list query are processed via `Promise.all`) share a single in-flight load.
 *
 * Ancestor ids requested within the same microtask window are collected into one query per
 * collection. Because every walk awaits a level before requesting the next one, all walks
 * running concurrently request the same level within one window: listing N documents costs one
 * query per level, not one per document.
 */
function loadAncestor({
  id,
  collection,
  locale,
  req,
}: {
  collection: CollectionSlug
  id: DocumentID
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  locale: 'all' | Locale | undefined
  req: PayloadRequest
}): Promise<AncestorRow | null> {
  // The cache key does not include the draft status because the cache is request-scoped
  // and context.draft is constant within a single request.
  const cacheKey = `${collection}:${id}:${locale ?? ''}`
  const cache = (req.context[CACHE_KEY] ??= new Map()) as Map<string, Promise<AncestorRow | null>>

  const cached = cache.get(cacheKey)
  if (cached) {
    return cached
  }

  const batches = (req.context[BATCH_KEY] ??= new Map()) as Map<string, Batch>
  const batchKey = `${collection}:${locale ?? ''}`

  let batch = batches.get(batchKey)
  if (!batch) {
    let reject!: (error: unknown) => void
    let resolve!: (rows: Map<string, AncestorRow>) => void
    const promise = new Promise<Map<string, AncestorRow>>((res, rej) => {
      resolve = res
      reject = rej
    })
    const created: Batch = { ids: [], promise, reject, resolve }
    batch = created
    batches.set(batchKey, created)

    // queueMicrotask (not setTimeout/nextTick) keeps the flush in the same microtask queue the
    // awaiting walks resume on, so every walk has queued its id for this level before it runs.
    queueMicrotask(() => {
      batches.delete(batchKey)
      void fetchAncestors({ collection, ids: created.ids, locale, req }).then(
        created.resolve,
        created.reject,
      )
    })
  }

  batch.ids.push(id)

  const promise = batch.promise.then(
    (rows) => rows.get(String(id)) ?? null,
    (error: unknown) => {
      cache.delete(cacheKey)
      throw error
    },
  )
  cache.set(cacheKey, promise)

  return promise
}

/** Reads the given ancestors of one collection in a single query (two when resolving drafts). */
async function fetchAncestors({
  collection,
  ids,
  locale,
  req,
}: {
  collection: CollectionSlug
  ids: DocumentID[]
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  locale: 'all' | Locale | undefined
  req: PayloadRequest
}): Promise<Map<string, AncestorRow>> {
  const { payload } = req
  const collectionConfig = payload.collections[collection]?.config
  const pageAttributes = collectionConfig ? pageAttributesOf(collectionConfig) : undefined

  if (!collectionConfig || !pageAttributes) {
    throw new Error(
      `[Pages Plugin] Cannot resolve breadcrumbs: the parent collection "${collection}" is not a page collection.`,
    )
  }

  const parentFieldName = pageAttributes.parent.name
  const labelField = pageAttributes.breadcrumbs.labelField
  const select: SelectType = {
    slug: true,
    isRootPage: true,
    [labelField]: true,
    [parentFieldName]: true,
  }

  const documents = new Map<string, Record<string, any>>()

  // A draft read resolves every ancestor to its latest version, the same way
  // `findByID({ draft: true })` resolves a single document.
  // Note: the top-level `parent` in the where/select below is Payload's versions-table field
  // referencing the versioned document — unrelated to the plugin's parent field, which lives
  // inside `version` under its configurable name.
  if (req.context.draft === true && hasDraftsEnabled(collectionConfig)) {
    const { docs } = await payload.db.findVersions({
      collection,
      limit: 0,
      locale,
      pagination: false,
      req,
      select: { parent: true, version: select },
      sort: '-updatedAt',
      where: { and: [{ parent: { in: ids } }, { latest: { equals: true } }] },
    })

    for (const versionDoc of docs) {
      const id = extractID((versionDoc as Record<string, any>).parent)
      if (id === null || documents.has(String(id))) {
        continue
      }
      documents.set(String(id), { ...(versionDoc as Record<string, any>).version, id })
    }
  }

  // Documents without a version row (drafts disabled, or never saved since drafts were
  // enabled) fall back to the main table, matching payload's own draft resolution.
  const missing = ids.filter((id) => !documents.has(String(id)))
  if (missing.length > 0) {
    const { docs } = await payload.db.find({
      collection,
      limit: 0,
      locale,
      pagination: false,
      req,
      select,
      where: { id: { in: missing } },
    })

    for (const doc of docs) {
      documents.set(String(doc.id), doc)
    }
  }

  const rows = new Map<string, AncestorRow>()
  for (const [key, doc] of documents) {
    rows.set(key, {
      id: doc.id as DocumentID,
      slug: doc.slug,
      collection,
      isRootPage: doc.isRootPage === true,
      label: doc[labelField],
      parentCollection: pageAttributes.parent.collection,
      parentId: extractID(doc[parentFieldName]),
    })
  }

  return rows
}

/** Returns the page attributes of a collection config, or undefined if it is not a page collection. */
function pageAttributesOf(config: CollectionConfig): PageCollectionConfigAttributes | undefined {
  return (
    asPageCollectionConfig(config)?.page ??
    (config.custom?.pageConfig as PageCollectionConfigAttributes | undefined)
  )
}

/** Whether the collection stores drafts in its versions table. */
function hasDraftsEnabled(config: CollectionConfig): boolean {
  return typeof config.versions === 'object' && Boolean(config.versions.drafts)
}

/** Extracts a plain id from a raw relationship value (an id, or a populated document). */
function extractID(value: unknown): DocumentID | null {
  if (typeof value === 'number' || typeof value === 'string') {
    return value
  }
  if (value && typeof value === 'object' && 'id' in value) {
    const id = value.id
    if (typeof id === 'number' || typeof id === 'string') {
      return id
    }
  }
  return null
}
