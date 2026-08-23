import { findPageByPath, payloadPagesPlugin } from '@jhb.software/payload-pages-plugin'
import path from 'path'
import { buildConfig, PayloadRequest } from 'payload'
import { fileURLToPath } from 'url'
import { Authors } from './collections/authors'
import { Blogposts } from './collections/blogposts'
import { Countries } from './collections/countries'
import { CountryTravelTips } from './collections/country-travel-tips'
import { Pages } from './collections/pages'
import { Topics } from './collections/topics'
import { Redirects } from './collections/redirects'
import { BlogpostCategories } from './collections/blogpost-categories'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import Tenants from './collections/tenants'
import { getTenantFromCookie } from '@payloadcms/plugin-multi-tenant/utilities'
import { databaseAdapter } from './test/databaseAdapter'
import { recordLocaleRoutingCall } from './test/localeRoutingCalls'
import { RESOLVER_READS_PAGES_HEADER } from './test/resolverReadsPages'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    autoLogin: {
      email: 'dev@payloadcms.com',
      password: 'test',
    },
    meta: { titleSuffix: '- Pages Multi-Tenant Dev' },
    user: 'users',
  },
  collections: [
    Pages,
    Topics,
    Authors,
    Blogposts,
    BlogpostCategories,
    Redirects,
    Countries,
    CountryTravelTips,
    Tenants,
    {
      slug: 'users',
      auth: true,
      fields: [],
    },
  ],
  db: databaseAdapter,
  secret: process.env.PAYLOAD_SECRET!,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  localization: {
    locales: ['de', 'en'],
    defaultLocale: 'en',
  },
  experimental: {
    localizeStatus: true,
  },
  plugins: [
    payloadPagesPlugin({
      generatePageURL: async ({ path, preview, data, req }) => {
        if (data.tenant && typeof data.tenant === 'string') {
          const tenant = await req.payload.findByID({
            collection: 'tenants',
            id: data.tenant,
            select: {
              websiteUrl: true,
            },
            req,
          })

          if (tenant && 'websiteUrl' in tenant && tenant.websiteUrl) {
            return `${tenant.websiteUrl}${preview ? '/preview' : ''}${path}`
          }
        }

        return null
      },
      baseFilter: ({ req }) => {
        const tenant = getTenantFromCookie(req.headers, req.payload.db.defaultIDType)

        return { tenant: { equals: tenant } }
      },
      redirectValidationFilter: ({ doc }) => {
        return { tenant: { equals: doc.tenant } }
      },
      // Each tenant decides which locale leads its site and whether that locale is prefixed.
      // Resolved once per request, so a 50-page find pays for one tenant lookup, not fifty.
      localeRouting: async ({ req }) => {
        recordLocaleRoutingCall()

        // Test-only: a resolver which reads a page collection with the same request. Such reads
        // see the default routing instead of re-entering the resolver.
        if (req.headers.get(RESOLVER_READS_PAGES_HEADER) === 'true') {
          await req.payload.find({ collection: 'pages', depth: 0, limit: 1, req })
        }

        const tenantId = getTenantFromCookie(req.headers, req.payload.db.defaultIDType)

        if (!tenantId) {
          return undefined
        }

        const tenant = await req.payload.findByID({
          collection: 'tenants',
          id: tenantId,
          depth: 0,
          disableErrors: true,
          req,
        })

        if (!tenant) {
          return undefined
        }

        return {
          primaryLocale: tenant.primaryLocale,
          prefixPrimaryLocale: Boolean(tenant.prefixAllLocales),
        }
      },
    }),
    multiTenantPlugin({
      collections: {
        authors: {},
        blogposts: {},
        'blogpost-categories': {},
        countries: {},
        'country-travel-tips': {},
        pages: {},
        redirects: {},
        topics: {},
      },
      userHasAccessToAllTenants: (user) => user.email === 'dev@payloadcms.com',
    }),
  ],
  endpoints: [
    {
      // Demonstrates that findPageByPath is scoped by the plugin's tenant baseFilter and by the
      // tenant's locale routing: select a tenant in the admin (sets the `payload-tenant` cookie),
      // then open e.g. http://localhost:3000/api/resolve-page?path=/pricing — the resolved page
      // belongs to the selected tenant. The "unprefixed" tenant resolves `/pricing`, the
      // "all-prefixed" one resolves `/de/pricing` for the very same page.
      path: '/resolve-page',
      method: 'get',
      handler: async (req) => {
        const path = typeof req.query.path === 'string' ? req.query.path : undefined

        if (!path) {
          return Response.json({ error: 'Missing `path` query parameter' }, { status: 400 })
        }

        // `req` carries the selected tenant, which the baseFilter reads — no explicit filter needed.
        const result = await findPageByPath({ path, req })

        if (!result) {
          return Response.json({ error: `No page found for path ${path}` }, { status: 404 })
        }

        return Response.json(result)
      },
    },
  ],
  async onInit(payload) {
    const existingUsers = await payload.find({
      collection: 'users',
      limit: 1,
    })

    // Two tenants whose locale routing differs, so the path preview, the redirect banner,
    // /api/resolve-page and /demo/path-index can be compared by switching the tenant cookie.
    const seedTenants = [
      {
        slug: 'unprefixed-de',
        name: 'Unprefixed German',
        websiteUrl: 'https://unprefixed.example.com',
        primaryLocale: 'de',
        prefixAllLocales: false,
      },
      {
        slug: 'all-prefixed',
        name: 'All Locales Prefixed',
        websiteUrl: 'https://prefixed.example.com',
        primaryLocale: 'en',
        prefixAllLocales: true,
      },
    ] as const

    for (const data of seedTenants) {
      const existing = await payload.find({
        collection: 'tenants',
        limit: 1,
        where: { slug: { equals: data.slug } },
      })

      if (existing.docs.length === 0) {
        await payload.create({ collection: 'tenants', data })
      }
    }

    if (existingUsers.docs.length === 0) {
      await payload.create({
        collection: 'users',
        data: {
          email: 'dev@payloadcms.com',
          password: 'test',
        },
      })
    }
  },
})
