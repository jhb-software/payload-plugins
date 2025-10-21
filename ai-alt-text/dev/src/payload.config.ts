import { payloadAiAltTextPlugin } from '@jhb.software/payload-ai-alt-text-plugin'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import { Media } from './collections/Media'
import { testEmailAdapter } from './emailAdapter'

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
  localization: {
    locales: ['en', 'de'],
    defaultLocale: 'en',
    fallback: true,
  },
  collections: [
    {
      slug: 'users',
      auth: true,
      fields: [],
    },
    Media,
  ],
  db: mongooseAdapter({
    url: process.env.DATABASE_URI!,
  }),
  email: testEmailAdapter,
  secret: process.env.PAYLOAD_SECRET!,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  plugins: [
    payloadAiAltTextPlugin({
      enabled: true,
      openAIApiKey: process.env.OPENAI_API_KEY || '',
      collections: ['media'], // Specify which collections should have AI alt text
      model: 'gpt-4o-mini',
      maxConcurrency: 5,
      getImageThumbnail: (doc: Record<string, unknown>) => {
        return doc.url as string
      },
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
