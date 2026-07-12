import {
  openAIResolver,
  payloadContentTranslatorPlugin,
} from '@jhb.software/payload-content-translator-plugin'
import { payloadPagesPlugin } from '@jhb.software/payload-pages-plugin'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { de } from 'payload/i18n/de'
import { en } from 'payload/i18n/en'
import { fileURLToPath } from 'url'

import { authorsSchema } from './collections/authors'
import { docsSchema } from './collections/docs'
import { mediaSchema } from './collections/media'
import { pagesSchema } from './collections/pages'
import { postsSchema } from './collections/posts'
import { makeSlugTranslatable } from './helpers/makeSlugTranslatable'
import { mockResolver } from './resolvers/mockResolver'
import { seed } from './seed'

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
    docsSchema,
    postsSchema,
    authorsSchema,
    mediaSchema,
    {
      slug: 'users',
      // API keys enabled so the agent translate-and-save flow
      // (POST /api/content-translator/translate with `update: true`) can be exercised
      // with `Authorization: users API-Key <key>`, the way an agent would.
      auth: { useAPIKey: true },
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
    // Fixed dev API key so the agent translate-and-save curl below is runnable
    // without copying a freshly generated key out of the admin panel each time.
    const devApiKey = '00000000-0000-4000-8000-000000000000'

    const { docs: existingUsers } = await payload.find({
      collection: 'users',
      limit: 1,
      where: { email: { equals: 'dev@payloadcms.com' } },
    })

    if (existingUsers.length === 0) {
      await payload.create({
        collection: 'users',
        data: {
          apiKey: devApiKey,
          email: 'dev@payloadcms.com',
          enableAPIKey: true,
          password: 'test',
        },
      })
    } else {
      await payload.update({
        id: existingUsers[0].id,
        collection: 'users',
        data: { apiKey: devApiKey, enableAPIKey: true },
      })
    }

    await seed(payload)

    payload.logger.info(
      'Try the agent translate-and-save flow:\n' +
        `  curl -X POST http://localhost:3000/api/content-translator/translate \\\n` +
        `    -H 'Content-Type: application/json' \\\n` +
        `    -H 'Authorization: users API-Key ${devApiKey}' \\\n` +
        `    -d '{"collectionSlug":"pages","id":"<page-id>","localeFrom":"en","locale":"de","update":true}'`,
    )
  },

  plugins: [
    payloadPagesPlugin({
      generatePageURL: ({ path, preview }) =>
        path && process.env.NEXT_PUBLIC_FRONTEND_URL
          ? `${process.env.NEXT_PUBLIC_FRONTEND_URL}${preview ? '/preview' : ''}${path}`
          : null,
    }),
    // Attach translator handling to the pages-plugin-injected slug field so it
    // derives a normalized slug from the translated title. Must run after
    // payloadPagesPlugin, which injects the slug field.
    makeSlugTranslatable(['pages']),
    payloadContentTranslatorPlugin({
      collections: ['pages', 'docs', 'posts', 'authors'],
      globals: [],
      // resolver: mockResolver(), // custom resolver for testing
      resolver: openAIResolver({
        apiKey: process.env.OPENAI_API_KEY || '',
        model: 'gpt-4o-mini',
      }),
    }),
  ],
})
