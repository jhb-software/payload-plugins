import { listPagePaths } from '@jhb.software/payload-pages-plugin'
import { createLocalReq, getPayload } from 'payload'
import config from '@payload-config'

/**
 * Demonstrates that the path index enumeration (`listPagePaths`) is scoped by the plugin's
 * tenant `baseFilter`.
 *
 * Start the dev app with `pnpm dev`, select a tenant in the admin (sets the `payload-tenant`
 * cookie), then open http://localhost:3000/demo/path-index — only the selected tenant's paths
 * are listed. Switching the tenant in the admin changes the result.
 */
export const GET = async (request: Request) => {
  const payload = await getPayload({ config })

  // Forward the incoming headers so the baseFilter can read the tenant cookie.
  const req = await createLocalReq({ req: { headers: request.headers } }, payload)

  const entries = await listPagePaths({ req })

  return Response.json({ count: entries.length, entries })
}
