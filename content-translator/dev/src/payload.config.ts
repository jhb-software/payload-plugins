import { payloadContentTranslatorPlugin } from '@jhb.software/payload-content-translator-plugin'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { de } from 'payload/i18n/de'
import { en } from 'payload/i18n/en'
import { fileURLToPath } from 'url'

import { authorsSchema } from './collections/authors'
import { mediaSchema } from './collections/media'
import { pagesSchema } from './collections/pages'
import { postsSchema } from './collections/posts'
import { mockResolver } from './resolvers/mockResolver'
import { seed } from './seed'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  admin: {
    autoLogin: {
      email: 'dev@payloadcms.com',
      password: 'test',
    },
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
      resolver: mockResolver(),
      // resolver: openAIResolver({
      //   apiKey: process.env.OPENAI_API_KEY || '',
      //   model: 'gpt-4o-mini',
      // }),
    }),
  ],
})
