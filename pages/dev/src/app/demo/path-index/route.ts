import { listPagePaths } from '@jhb.software/payload-pages-plugin'
import { createLocalReq, getPayload, type CollectionSlug } from 'payload'
import config from '@payload-config'

/**
 * Demonstrates the path index enumeration (`listPagePaths`).
 *
 * Start the dev app with `pnpm dev` and open http://localhost:3000/demo/path-index
 *
 * Returns every live path across all page collections — one entry per (document, locale) —
 * the shape a sitemap or llms.txt would be built from. Optional query parameters exercise
 * the arguments:
 *   ?locale=de            narrow to one locale
 *   ?collections=pages    narrow to specific page collections (comma-separated)
 */
export const GET = async (request: Request) => {
  const payload = await getPayload({ config })
  const req = await createLocalReq({}, payload)

  const url = new URL(request.url)
  const locale = url.searchParams.get('locale') ?? undefined
  const collections = url.searchParams.get('collections')?.split(',') as
    CollectionSlug[] | undefined

  const entries = await listPagePaths({ collections, locale, req })

  return Response.json({ count: entries.length, entries })
}
