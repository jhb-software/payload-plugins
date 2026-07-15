import { findPageByPath, payloadPagesPlugin } from '@jhb.software/payload-pages-plugin'
import path from 'path'
import { buildConfig, PayloadRequest } from 'payload'
import { fileURLToPath } from 'url'
import { Authors } from './collections/authors'
import { Blogposts } from './collections/blogposts'
import { Countries } from './collections/countries'
import { CountryTravelTips } from './collections/country-travel-tips'
import { Pages } from './collections/pages'
import { Redirects } from './collections/redirects'
import { BlogpostCategories } from './collections/blogpost-categories'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import Tenants from './collections/tenants'
import { getTenantFromCookie } from '@payloadcms/plugin-multi-tenant/utilities'
import { databaseAdapter } from './test/databaseAdapter'

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
  localization: false,
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
      },
      userHasAccessToAllTenants: (user) => user.email === 'dev@payloadcms.com',
    }),
  ],
  endpoints: [
    {
      // Demonstrates that findPageByPath is scoped by the plugin's tenant baseFilter:
      // select a tenant in the admin (sets the `payload-tenant` cookie), then open e.g.
      // http://localhost:3000/api/resolve-page?path=/pricing — the resolved page belongs to
      // the selected tenant. The same path resolves to a different page for another tenant.
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
