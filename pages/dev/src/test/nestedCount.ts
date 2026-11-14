import type { CollectionBeforeReadHook } from 'payload'

/**
 * Test-only request header which makes a user `beforeRead` hook count the `pages` collection with
 * the incoming request, so an operation nested inside a read — and one carrying no `draft` of its
 * own — can be exercised end to end.
 */
export const COUNT_PAGES_DURING_READ_HEADER = 'x-test-count-pages-during-read'

/** Counts the `pages` collection with the request the outer read was given. */
export const countPagesDuringRead: CollectionBeforeReadHook = async ({ doc, req }) => {
  if (req.headers.get(COUNT_PAGES_DURING_READ_HEADER) === 'true') {
    await req.payload.count({ collection: 'pages', req })
  }

  return doc
}
