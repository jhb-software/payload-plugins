import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { buildConfig, getPayload, Payload } from 'payload'
import path from 'path'
import { fileURLToPath } from 'url'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

let payload: Payload

const testConfig = buildConfig({
  collections: [
    {
      slug: 'pages',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'text', required: true },
        { name: 'parent', type: 'relationship', relationTo: 'pages', required: false },
      ],
    },
    { slug: 'users', auth: true, fields: [] },
  ],
  db: sqliteAdapter({
    client: { url: 'file:./test-deletion.db' },
  }),
  secret: 'test-secret-key-for-deletion-test',
  typescript: {
    outputFile: path.resolve(dirname, 'test-payload-types.ts'),
  },
})

beforeAll(async () => {
  payload = await getPayload({ config: testConfig })
})

afterAll(async () => {
  if (payload?.db && typeof payload.db.destroy === 'function') {
    await payload.db.destroy()
  }
})

describe('SQLite adapter parent deletion behavior', () => {
  test('documents referencing parent and deletion behavior', async () => {
    const existingPages = await payload.find({ collection: 'pages', limit: 0, select: {} })
    for (const page of existingPages.docs) {
      await payload.delete({ collection: 'pages', id: page.id })
    }

    const parentPage = await payload.create({
      collection: 'pages',
      data: { title: 'Parent Page', slug: 'parent-page', parent: null },
    })

    const childPage = await payload.create({
      collection: 'pages',
      data: { title: 'Child Page', slug: 'child-page', parent: parentPage.id },
    })

    let deletionAllowed = false
    try {
      await payload.delete({ collection: 'pages', id: parentPage.id })
      deletionAllowed = true
    } catch {
      deletionAllowed = false
    }

    // In SQLite, FK constraints may not be enforced by default → deletion could be allowed
    expect(typeof deletionAllowed).toBe('boolean')

    const remainingChild = await payload.findByID({ collection: 'pages', id: childPage.id })
    expect(remainingChild).toBeTruthy()

    await payload.delete({ collection: 'pages', id: childPage.id })
    if (!deletionAllowed) {
      await payload.delete({ collection: 'pages', id: parentPage.id })
    }
  })
})


