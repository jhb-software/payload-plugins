import { payloadPagesPlugin } from '@jhb.software/payload-pages-plugin'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import { Authors } from './collections/authors.js'
import { Blogposts } from './collections/blogposts.js'
import { Countries } from './collections/countries.js'
import { CountryTravelTips } from './collections/country-travel-tips.js'
import { Pages } from './collections/pages.js'
import { Redirects } from './collections/redirects.js'
import { BlogpostCategories } from './collections/blogpost-categories.js'
import { en } from 'payload/i18n/en'
import { de } from 'payload/i18n/de'
import { databaseAdapter } from './test/databaseAdapter.js'

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
