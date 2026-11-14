import { listPagePaths } from '@jhb.software/payload-pages-plugin'
import config from '@payload-config'
import { type CollectionSlug, createLocalReq, getPayload } from 'payload'

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
 *   ?metaTitle=Foo        function-form where: filters `meta.title` on the pages collection
 *                         only, leaving collections without that field unfiltered
 *   ?enforceAccess=1      overrideAccess: false — enforce each collection's read access
 */
export const GET = async (request: Request) => {
  const payload = await getPayload({ config })
  const req = await createLocalReq({}, payload)

  const url = new URL(request.url)
  const locale = url.searchParams.get('locale') ?? undefined
  const collections = url.searchParams.get('collections')?.split(',') as
    CollectionSlug[] | undefined
  const metaTitle = url.searchParams.get('metaTitle')
  const enforceAccess = url.searchParams.get('enforceAccess') !== null

  const entries = await listPagePaths({
    collections,
    locale,
    req,
    ...(enforceAccess ? { overrideAccess: false } : {}),
    ...(metaTitle
      ? {
          where: ({ slug }: { slug: CollectionSlug }) =>
            slug === 'pages' ? { 'meta.title': { equals: metaTitle } } : undefined,
        }
      : {}),
  })

  return Response.json({ count: entries.length, entries })
}
