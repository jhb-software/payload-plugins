import type {
  CollectionSlug,
  DefaultDocumentIDType,
  PayloadRequest,
  SelectType,
  Where,
} from 'payload'

import { hasDraftsEnabled } from 'payload/shared'

import type { PageCollectionConfig } from '../types/PageCollectionConfig.js'
import type { ParentRef } from './parentRef.js'

import { livePerLocale } from '../queries/liveness.js'
import { isPageCollectionConfig } from './pageCollectionConfigHelpers.js'
import {
  hasPolymorphicParent,
  parentCollections,
  parentRefKey,
  resolveParentRef,
} from './parentRef.js'

/** A document of the subtree below a given root, reduced to what path substitution needs. */
export type DescendantRow = {
  collection: CollectionSlug
  id: DefaultDocumentIDType
  /** Whether the document's own path resolves (published and not trashed), per locale. */
  live: Record<string, boolean>
  /** The document this one is parented to. */
  parent: ParentRef
  /** The raw slug value: locale-keyed on a localized install, a plain string otherwise. */
  slug: unknown
}

/**
 * Loads every document below the given root, across all page collections, in BFS order
 * (parents always precede their children).
 *
 * Mirrors `loadAncestors`: rows are read through `payload.db`, so no descendant collection's
 * hooks fire, and each level costs one query per candidate collection rather than one per
 * document. The levels are read sequentially on purpose — inside an `afterChange` hook the walk
 * runs on the caller's transaction, where MongoDB forbids concurrent operations on one session
 * and Postgres serializes them on one connection.
 */
export async function loadDescendants({
  req,
  root,
}: {
  req: PayloadRequest
  root: ParentRef
}): Promise<DescendantRow[]> {
  const { payload } = req
  const pageCollections = payload.config.collections.filter((collection) =>
    isPageCollectionConfig(collection),
  ) as PageCollectionConfig[]

  const locales = payload.config.localization ? payload.config.localization.localeCodes : undefined
  const localized = Boolean(locales)
  const rows: DescendantRow[] = []
  const visited = new Set<string>([parentRefKey(root)])

  let level: ParentRef[] = [root]

  while (level.length > 0) {
    const idsByCollection = new Map<CollectionSlug, DefaultDocumentIDType[]>()
    for (const ref of level) {
      const ids = idsByCollection.get(ref.collection) ?? []
      ids.push(ref.id)
      idsByCollection.set(ref.collection, ids)
    }

    const nextLevel: ParentRef[] = []

    for (const collection of pageCollections) {
      const where = childrenOfWhere(collection, idsByCollection)
      if (!where) {
        continue
      }

      const parentFieldName = collection.page.parent.name
      const select: SelectType = {
        slug: true,
        [parentFieldName]: true,
        ...(hasDraftsEnabled(collection) ? { _status: true } : {}),
        ...(collection.trash ? { deletedAt: true } : {}),
      }

      const { docs } = await payload.db.find({
        collection: collection.slug,
        limit: 0,
        locale: localized ? 'all' : undefined,
        pagination: false,
        req,
        select,
        where,
      })

      for (const doc of docs as Record<string, unknown>[]) {
        const row: DescendantRow = {
          id: doc.id as DefaultDocumentIDType,
          slug: doc.slug,
          collection: collection.slug,
          live: livePerLocale(doc, collection, locales),
          parent: resolveParentRef(doc[parentFieldName], collection.page)!,
        }

        const key = parentRefKey(row)
        if (visited.has(key)) {
          continue
        }
        visited.add(key)

        rows.push(row)
        nextLevel.push({ id: row.id, collection: row.collection })
      }
    }

    level = nextLevel
  }

  return rows
}

/**
 * The condition matching the collection's documents whose parent is one of the given ids, or
 * null when the collection cannot be parented to any of the level's collections.
 */
function childrenOfWhere(
  collection: PageCollectionConfig,
  idsByCollection: Map<CollectionSlug, DefaultDocumentIDType[]>,
): null | Where {
  const parentFieldName = collection.page.parent.name

  if (!hasPolymorphicParent(collection.page)) {
    const target = collection.page.parent.collection as CollectionSlug
    const ids = idsByCollection.get(target)
    return ids ? { [parentFieldName]: { in: ids } } : null
  }

  // A polymorphic parent stores `{ relationTo, value }`; matching on the value alone would also
  // match a document of another collection sharing the id (which the SQL adapters' serial ids
  // readily do), so each candidate collection is matched together with its `relationTo`.
  const clauses: Where[] = []
  for (const target of parentCollections(collection.page)) {
    const ids = idsByCollection.get(target)
    if (ids) {
      clauses.push({
        and: [
          { [`${parentFieldName}.relationTo`]: { equals: target } },
          { [`${parentFieldName}.value`]: { in: ids } },
        ],
      })
    }
  }

  return clauses.length > 0 ? { or: clauses } : null
}

/** The pre- or post-write paths of a descendant, one entry per locale with a computable path. */
export type DescendantPaths = {
  collection: CollectionSlug
  id: DefaultDocumentIDType
  live: Record<string, boolean>
  paths: Record<string, string>
}

/**
 * Assembles the descendants' paths by prefix substitution: a path is exactly
 * `[/locale, ...ancestorSlugs, ownSlug].join('/')`, so a descendant's path is its parent's path
 * plus its own slug.
 *
 * Substitution rather than recomputation is a correctness requirement, not an optimization:
 * recomputing through the ancestor walk on the same request can return a stale path, because the
 * request-scoped ancestor cache may still hold the pre-update row of the document which was just
 * renamed — and an old path may no longer exist to be queried at all.
 *
 * `basePaths` maps a locale (or `''` on an unlocalized install) to the root's path. A locale
 * missing from the base, or a descendant without a slug for it, yields no path for that locale.
 */
export function assembleDescendantPaths(
  basePaths: Record<string, string>,
  root: ParentRef,
  rows: DescendantRow[],
): DescendantPaths[] {
  const pathsByRef = new Map<string, Record<string, string>>([[parentRefKey(root), basePaths]])

  return rows.map((row) => {
    const parentPaths = pathsByRef.get(parentRefKey(row.parent)) ?? {}
    const paths: Record<string, string> = {}

    for (const [locale, base] of Object.entries(parentPaths)) {
      const slug =
        typeof row.slug === 'string'
          ? row.slug
          : ((row.slug as null | Record<string, unknown>)?.[locale] as string | undefined)
      if (slug) {
        paths[locale] = `${base}/${slug}`
      }
    }

    pathsByRef.set(parentRefKey(row), paths)

    return { id: row.id, collection: row.collection, live: row.live, paths }
  })
}
