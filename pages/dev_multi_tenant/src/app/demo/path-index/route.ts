import { listPagePaths } from '@jhb.software/payload-pages-plugin'
import config from '@payload-config'
import { createLocalReq, getPayload } from 'payload'

/**
 * Demonstrates that the path index enumeration (`listPagePaths`) is scoped by the plugin's
 * tenant `baseFilter`, and how infrastructure code lifts that scoping.
 *
 * Start the dev app with `pnpm dev`, select a tenant in the admin (sets the `payload-tenant`
 * cookie), then open http://localhost:3000/demo/path-index — only the selected tenant's paths
 * are listed. Switching the tenant in the admin changes the result.
 *
 * Optional query parameters exercise explicit scoping (a sitemap sweep or cache warmer):
 *   ?allTenants=1    baseFilter: false — every tenant's paths in one call
 *   ?tenant=<id>     baseFilter: false + an explicit tenant where — enumerates that tenant
 *                    regardless of the request's tenant cookie
 */
export const GET = async (request: Request) => {
  const payload = await getPayload({ config })

  // Forward the incoming headers so the baseFilter can read the tenant cookie.
  const req = await createLocalReq({ req: { headers: request.headers } }, payload)

  const url = new URL(request.url)
  const tenant = url.searchParams.get('tenant')
  const allTenants = url.searchParams.get('allTenants') !== null

  const entries =
    tenant || allTenants
      ? await listPagePaths({
          baseFilter: false,
          req,
          ...(tenant ? { where: { tenant: { equals: tenant } } } : {}),
        })
      : await listPagePaths({ req })

  return Response.json({ count: entries.length, entries })
}
