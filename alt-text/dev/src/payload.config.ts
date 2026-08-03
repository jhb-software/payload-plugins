import {
  openAIResolver,
  payloadAltTextPlugin,
  validateAltText,
} from '@jhb.software/payload-alt-text-plugin'
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

const serverURL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'

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
      collections: [
        // `media` accepts both images and videos — restrict alt text tracking to images only.
        { slug: 'media', mimeTypes: ['image/*'] },
        // Bare slug defaults to `['image/*']`.
        'images',
        // Demonstrates the per-collection `validate` option: skip the required-alt
        // check when the request body does not touch `alt` (e.g. folder moves,
        // partial API updates). Without this, folder moves on docs with empty
        // locales fail validation under `localization.fallback: false`. See #95.
        {
          slug: 'media-with-folders',
          // Not served through the image CDN below, so it opts out of the
          // plugin-level `imageThumbnailMimeType` and is checked on each
          // document's own mime type again.
          imageThumbnailMimeType: null,
          validate: (value, args) => {
            const { req } = args
            if (!req.data || !('alt' in req.data)) return true
            return validateAltText(value, args)
          },
        },
      ],
      resolver: openAIResolver({
        apiKey: process.env.OPENAI_API_KEY!,
        model: 'gpt-4.1-mini',
        // Pointing `baseUrl` at another OpenAI-compatible provider? Declare the
        // formats that provider accepts instead of inheriting OpenAI's list:
        // supportedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      }),
      // Cap how many images a single bulk-generate request may process.
      // Selecting more than this in the list view returns a 400 instead of
      // fanning out into an unbounded number of paid resolver calls.
      maxBulkGenerateIds: 25,
      // The function form gates the collection-wide health report (endpoint and
      // widget) more strictly than the per-document generate endpoints, which
      // allow any authenticated user: here only the designated admin sees it.
      healthCheck: ({ req }) => req.user?.email === 'dev@payloadcms.com',
      // `media` and `images` are the website's images: they are served through
      // an image CDN that always emits WebP, whatever was uploaded. Declaring
      // that delivered format takes the stored mime type out of the decision
      // entirely — upload an AVIF or HEIC image and the Generate button stays
      // enabled and generation succeeds, even though the OpenAI resolver
      // rejects those source formats.
      imageThumbnailMimeType: 'image/webp',
      getImageThumbnail: (doc, { collection }) => {
        // The `collection` argument lets one function build a different URL per
        // collection — here, the CDN for the website's images and the raw
        // origin url for the collection that does not sit behind it.
        if (collection === 'media-with-folders') {
          return doc.url as string
        }

        return `${serverURL}/api/image-cdn/${collection}/${doc.id}`
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
