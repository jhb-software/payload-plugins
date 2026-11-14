import { listPagePaths } from '@jhb.software/payload-pages-plugin'
import { createLocalReq, getPayload } from 'payload'
import config from '@payload-config'

/**
 * Demonstrates the path index enumeration (`listPagePaths`) on an unlocalized install.
 *
 * Start the dev app with `pnpm dev` and open http://localhost:3000/demo/path-index
 *
 * Returns every live path across all page collections — one entry per document, without a
 * `locale` property — the shape a sitemap or llms.txt would be built from.
 */
export const GET = async () => {
  const payload = await getPayload({ config })
  const req = await createLocalReq({}, payload)

  const entries = await listPagePaths({ req })

  return Response.json({ count: entries.length, entries })
}
