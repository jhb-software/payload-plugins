import { payloadPagesPlugin } from '@jhb.software/payload-pages-plugin'
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
