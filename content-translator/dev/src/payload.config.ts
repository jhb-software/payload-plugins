import {
  openAIResolver,
  payloadContentTranslatorPlugin,
} from '@jhb.software/payload-content-translator-plugin'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { de } from 'payload/i18n/de'
import { en } from 'payload/i18n/en'
import { fileURLToPath } from 'url'

import { authorsSchema } from './collections/authors.js'
import { mediaSchema } from './collections/media.js'
import { pagesSchema } from './collections/pages.js'
import { postsSchema } from './collections/posts.js'
import { mockResolver } from './resolvers/mockResolver.js'
import { seed } from './seed.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  admin: {
    autoLogin: {
      email: 'dev@payloadcms.com',
      password: 'test',
    },
    meta: { titleSuffix: '- Content Translator Dev' },
    user: 'users',
  },
  collections: [
    pagesSchema,
    postsSchema,
    authorsSchema,
    mediaSchema,
    {
      slug: 'users',
      auth: true,
      fields: [],
    },
  ],
  db: mongooseAdapter({
    url: process.env.DATABASE_URI!,
  }),

  editor: lexicalEditor(),

  i18n: {
    supportedLanguages: { de, en },
  },

  localization: {
    defaultLocale: 'en',
    locales: ['en', 'de'],
  },

  secret: process.env.PAYLOAD_SECRET || 'secret',

  typescript: {
    outputFile: path.resolve(__dirname, '../payload-types.ts'),
  },

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

    await seed(payload)
  },

  plugins: [
    payloadContentTranslatorPlugin({
      collections: ['pages', 'posts', 'authors'],
      globals: [],
      // resolver: mockResolver(), // custom resolver for testing
      resolver: openAIResolver({
        apiKey: process.env.OPENAI_API_KEY || '',
        model: 'gpt-4o-mini',
      }),
    }),
  ],
})
