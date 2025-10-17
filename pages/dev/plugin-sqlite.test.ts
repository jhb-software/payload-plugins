import payload from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import path from 'path'
import { payloadPagesPlugin } from '@jhb.software/payload-pages-plugin'
import { Pages } from './src/collections/pages'
import { Authors } from './src/collections/authors'
import { Blogposts } from './src/collections/blogposts'
import { BlogpostCategories } from './src/collections/blogpost-categories'
import { Redirects } from './src/collections/redirects'
import { Countries } from './src/collections/countries'
import { CountryTravelTips } from './src/collections/country-travel-tips'
import { en } from 'payload/i18n/en'
import { de } from 'payload/i18n/de'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Create a SQLite-specific config
const sqliteConfig = buildConfig({
  admin: {
    autoLogin: {
      email: 'dev@payloadcms.com',
      password: 'test',
    },
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
  db: sqliteAdapter({
    client: {
      url: process.env.SQLITE_TEST_URL || 'file:./test-sqlite.db',
    },
  }),
  secret: process.env.PAYLOAD_SECRET || 'test-secret',
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
  plugins: [payloadPagesPlugin({})],
})

beforeAll(async () => {
  await payload.init({
    config: sqliteConfig,
  })

  // Clean up test data
  for (const collection of (await sqliteConfig).collections.filter((c) => c.slug !== 'users')) {
    await payload.delete({
      collection: collection.slug,
      where: {},
    })
  }
}, 30000)

afterAll(async () => {
  if (payload.db && typeof payload.db.destroy === 'function') {
    await payload.db.destroy()
  }
}, 30000)

describe('Parent deletion prevention with SQLite', () => {
  test('prevents deletion when child dependencies exist', async () => {
    // Create parent page
    const parentPage = await payload.create({
      collection: 'pages',
      locale: 'de',
      data: {
        title: 'Parent Page',
        slug: 'parent-page-sqlite',
        content: 'Parent content',
      },
    })

    // Create child page referencing the parent
    await payload.create({
      collection: 'pages',
      locale: 'de',
      data: {
        title: 'Child Page',
        slug: 'child-page-sqlite',
        content: 'Child content',
        parent: parentPage.id,
      },
    })

    // Attempt to delete the parent page - should throw error
    await expect(
      payload.delete({
        collection: 'pages',
        id: parentPage.id,
      })
    ).rejects.toThrow('Cannot delete this document because it is referenced as a parent by')
  })

  test('allows deletion when no child dependencies exist', async () => {
    // Create parent page
    const parentPage = await payload.create({
      collection: 'pages',
      locale: 'de',
      data: {
        title: 'Parent Page',
        slug: 'parent-page-allows-deletion-sqlite',
        content: 'Parent content',
      },
    })

    // Create another page without parent reference
    await payload.create({
      collection: 'pages',
      locale: 'de',
      data: {
        title: 'Independent Page',
        slug: 'independent-page-sqlite',
        content: 'Independent content',
      },
    })

    // Delete the parent page - should succeed
    const result = await payload.delete({
      collection: 'pages',
      id: parentPage.id,
    })

    // Verify deletion succeeded
    expect(result).toBeTruthy()
    if (result && result.docs) {
      expect(result.docs).toHaveLength(1)
      expect(result.docs[0].id).toBe(parentPage.id)
    }
  })
})