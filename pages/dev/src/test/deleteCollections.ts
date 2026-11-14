import payload, { type CollectionSlug, type SanitizedConfig } from 'payload'

/**
 * Deletes all documents from a collection.
 */
export const deleteCollection = async (collection: CollectionSlug) => {
  // use db.deleteMany instead of payload.delete to avoid running hooks
  await payload.db.deleteMany({
    collection: collection,
    where: {},
  })

  // this will fail for collections which have no versions enabled, therefore wrapped in a try catch
  try {
    await payload.db.deleteVersions({
      collection: collection,
      where: {},
    })
  } catch {}
}

/**
 * Deletion order for collections to respect foreign key constraints.
 * Collections are deleted in this order: children before parents.
 * Collections not in this list will be deleted at the end in arbitrary order.
 */
const COLLECTION_DELETION_ORDER: CollectionSlug[] = [
  // Level 3: deepest nested (depends on level 2)
  'country-travel-tips',
  // Level 2: depends on level 1 collections
  'blogposts',
  'authors',
  'countries',
  // announcements hang off pages and topics, topics off pages and themselves
  'announcements',
  'topics',
  // Level 1: root collections (pages can self-reference)
  'pages',
  // Level 0: no dependencies
  'blogpost-categories',
  'redirects',
]

export const deleteAllCollections = async (
  config: Promise<SanitizedConfig>,
  except: CollectionSlug[] = [],
) => {
  const collections = (await config).collections?.filter((c) => !except.includes(c.slug)) ?? []
  const collectionSlugs = new Set(collections.map((c) => c.slug))

  // Delete in the specified order first
  for (const slug of COLLECTION_DELETION_ORDER) {
    if (collectionSlugs.has(slug)) {
      await deleteCollection(slug)
      collectionSlugs.delete(slug)
    }
  }

  // Delete any remaining collections not in the order list
  for (const slug of Array.from(collectionSlugs)) {
    await deleteCollection(slug)
  }
}
