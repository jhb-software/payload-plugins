import { openAIResolver, payloadAltTextPlugin } from '@jhb.software/payload-alt-text-plugin'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { de } from '@payloadcms/translations/languages/de'
import { en } from '@payloadcms/translations/languages/en'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import { Media } from './collections/Media'
import { Images } from './collections/Images'

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
  i18n: {
    supportedLanguages: { en, de },
  },
  collections: [
    {
      slug: 'users',
      auth: true,
      fields: [],
    },
    Media,
    Images,
  ],
  db: mongooseAdapter({
    url: process.env.MONGODB_URL!,
  }),
  secret: process.env.PAYLOAD_SECRET!,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  plugins: [
    payloadAltTextPlugin({
      collections: ['media', 'images'], // Specify which upload collections should have alt text fields
      resolver: openAIResolver({
        apiKey: process.env.OPENAI_API_KEY!,
        model: 'gpt-4.1-mini',
      }),
      getImageThumbnail: (doc: Record<string, unknown>) => {
        // in a real application, you would use a function to get a thumbnail URL (e.g. from the sizes)
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
