import { findPageByPath, payloadPagesPlugin } from '@jhb.software/payload-pages-plugin'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import { Authors } from './collections/authors'
import { Blogposts } from './collections/blogposts'
import { Countries } from './collections/countries'
import { CountryTravelTips } from './collections/country-travel-tips'
import { Pages } from './collections/pages'
import { Redirects } from './collections/redirects'
import { BlogpostCategories } from './collections/blogpost-categories'
import { en } from 'payload/i18n/en'
import { de } from 'payload/i18n/de'
import { databaseAdapter } from './test/databaseAdapter'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    autoLogin: {
      email: 'dev@payloadcms.com',
      password: 'test',
    },
    meta: { titleSuffix: '- Pages Dev' },
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
    defaultLocale: 'de',
  },
  i18n: {
    supportedLanguages: { en, de },
  },
  plugins: [
    payloadPagesPlugin({
      generatePageURL: ({ path, preview }) =>
        path && process.env.NEXT_PUBLIC_FRONTEND_URL
          ? `${process.env.NEXT_PUBLIC_FRONTEND_URL}${preview ? '/preview' : ''}${path}`
          : null,
      // Cache path→page lookups of findPageByPath in the KV store (default: true)
      pathCache: true,
    }),
  ],
  endpoints: [
    {
      // Demonstrates findPageByPath, e.g. http://localhost:3000/api/resolve-page?path=/de/blog
      // Add `&draft=true` to resolve draft pages.
      path: '/resolve-page',
      method: 'get',
      handler: async (req) => {
        const path = typeof req.query.path === 'string' ? req.query.path : undefined

        if (!path) {
          return Response.json({ error: 'Missing `path` query parameter' }, { status: 400 })
        }

        const result = await findPageByPath({
          draft: req.query.draft === 'true',
          path,
          req,
        })

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
