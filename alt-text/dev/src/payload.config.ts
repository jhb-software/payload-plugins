import {
  mistralResolver,
  openAIResolver,
  payloadAltTextPlugin,
  validateAltText,
} from '@jhb.software/payload-alt-text-plugin'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { getTenantFromCookie } from '@payloadcms/plugin-multi-tenant/utilities'
import { de } from '@payloadcms/translations/languages/de'
import { en } from '@payloadcms/translations/languages/en'
import path from 'path'
import type { Where } from 'payload'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import { Media } from './collections/Media'
import { Images } from './collections/Images'
import { MediaWithFolders } from './collections/MediaWithFolders'
import { Tenants } from './collections/Tenants'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const serverURL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'

/**
 * Stands in for the async work a signed CDN URL needs (S3 presigning, minting a
 * short-lived token). The dev CDN route ignores the signature; the point is that
 * `getImageThumbnail` is allowed to await.
 */
async function signThumbnailUrl(url: string): Promise<string> {
  const expires = Date.now() + 60_000
  return await Promise.resolve(`${url}?expires=${expires}`)
}

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
    // `fallback: false` reproduces the folder-move scenario from #95:
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
    Tenants,
  ],
  db: mongooseAdapter({
    url: process.env.MONGODB_URL!,
  }),
  secret: process.env.PAYLOAD_SECRET!,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  plugins: [
    multiTenantPlugin({
      collections: { images: {}, media: {} },
      userHasAccessToAllTenants: () => true,
    }),
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
      // Set MISTRAL_API_KEY to exercise the Mistral resolver, which sends the
      // image bytes as a data URI instead of handing the provider a URL — the
      // case `imageThumbnailMimeType` below exists for, since a media type
      // cannot be sniffed from a URL.
      resolver: process.env.MISTRAL_API_KEY
        ? mistralResolver({
            apiKey: process.env.MISTRAL_API_KEY,
            model: 'mistral-medium-latest',
          })
        : openAIResolver({
            apiKey: process.env.OPENAI_API_KEY!,
            model: 'gpt-4.1-mini',
            // Pointing `baseUrl` at another OpenAI-compatible provider? Declare
            // the formats that provider accepts instead of inheriting OpenAI's
            // list:
            // supportedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
          }),
      // Cap how many images a single bulk-generate request may process.
      // Selecting more than this in the list view returns a 400 instead of
      // fanning out into an unbounded number of paid resolver calls.
      maxBulkGenerateIds: 25,
      healthCheck: {
        // Gates the collection-wide health report (endpoint and widget) more
        // strictly than the per-document generate endpoints, which allow any
        // authenticated user: here only the designated admin sees it.
        access: ({ req }) => req.user?.email === 'dev@payloadcms.com',
        // Counts only the images of the tenant selected in the admin panel.
        // Switch tenants in the selector and the widget's numbers follow.
        baseFilter: ({ collection, req }): Where => {
          // `media-with-folders` is shared across tenants, so it carries no
          // `tenant` field — scoping it would be an error. This is why the
          // filter is resolved per collection.
          if (collection === 'media-with-folders') {
            return {}
          }

          const tenant = getTenantFromCookie(req.headers, req.payload.db.defaultIDType)

          // No tenant selected: report every document, matching what the tenant
          // selector shows.
          return tenant ? { tenant: { equals: tenant } } : {}
        },
      },
      // `media` and `images` are the website's images: they are served through
      // an image CDN that always emits WebP, whatever was uploaded. Declaring
      // that delivered format takes the stored mime type out of the decision
      // entirely — upload an AVIF or HEIC image and the Generate button stays
      // enabled and generation succeeds, even though neither resolver accepts
      // those source formats.
      imageThumbnailMimeType: 'image/webp',
      // Async because real CDNs usually want a signed URL. `signThumbnailUrl`
      // stands in for S3 presigning or a signed-CDN token here.
      getImageThumbnail: async (doc, { collection }) => {
        // The `collection` argument lets one function build a different URL per
        // collection — here, the CDN for the website's images and the raw
        // origin url for the collection that does not sit behind it.
        if (collection === 'media-with-folders') {
          return doc.url as string
        }

        return await signThumbnailUrl(`${serverURL}/api/image-cdn/${collection}/${doc.id}`)
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

    // Seeding a plugin-managed collection from `onInit` runs the plugin's
    // `afterChange` hook — and with it the health cache revalidation — while
    // the admin route is rendering. Deliberately no `disableRevalidate` in the
    // context: this exercises the `after()`-deferred revalidation that keeps
    // render-time writes from crashing with `revalidateTag … during render`.
    const existingMedia = await payload.find({
      collection: 'media',
      limit: 1,
    })

    if (existingMedia.docs.length === 0) {
      await payload.create({
        collection: 'media',
        data: {
          alt: 'Sample image seeded from onInit',
        },
        filePath: path.resolve(dirname, '../seed/sample-image.png'),
      })
    }

    // Two tenants with deliberately different alt text coverage, so the health
    // widget's numbers visibly change when the tenant selector is switched:
    // Acme has one complete image, Globex has two images with none.
    const existingTenants = await payload.find({ collection: 'tenants', limit: 1 })

    if (existingTenants.docs.length === 0) {
      const seedImage = path.resolve(dirname, '../seed/sample-image.png')

      const acme = await payload.create({
        collection: 'tenants',
        data: { name: 'Acme' },
      })
      const globex = await payload.create({
        collection: 'tenants',
        data: { name: 'Globex' },
      })

      const images: { alt: string; tenant: string }[] = [
        { alt: 'An Acme product photo', tenant: acme.id as string },
        { alt: '', tenant: globex.id as string },
        { alt: '', tenant: globex.id as string },
      ]

      for (const { alt, tenant } of images) {
        await payload.create({
          collection: 'images',
          data: { alt, tenant },
          filePath: seedImage,
        })
      }
    }
  },
})
