import { openAIResolver, payloadAltTextPlugin } from '@jhb.software/payload-alt-text-plugin'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { de } from '@payloadcms/translations/languages/de'
import { en } from '@payloadcms/translations/languages/en'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import { Media } from './collections/Media'
import { Images } from './collections/Images'
import { MediaWithFolders } from './collections/MediaWithFolders'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    autoLogin: {
      email: 'dev@payloadcms.com',
      password: 'test',
    },
    dashboard: {
      defaultLayout: [{ widgetSlug: 'alt-text-health', width: 'full' }],
    },
    meta: { titleSuffix: '- Alt Text Dev' },
    user: 'users',
  },
  localization: {
    locales: ['en', 'de'],
    defaultLocale: 'en',
    // `fallback: false` lets us reproduce the folder-move scenario from #95:
    // a doc with alt text only in `en` truly has empty alt in `de`, so the
    // pre-fix validator rejected folder moves that didn't touch the alt field.
    fallback: false,
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
    MediaWithFolders,
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
      collections: ['media', 'images', 'media-with-folders'], // Specify which upload collections should have alt text fields
      resolver: openAIResolver({
        apiKey: process.env.OPENAI_API_KEY!,
        model: 'gpt-4.1-mini',
      }),
      healthCheck: true,
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
