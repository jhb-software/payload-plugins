import payload from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import config from './src/payload.config'

// TODO: add the following tests:
// - virtual fields generation works for nested docs across collections
// - redirects are sucessfully created when the slug of a doc changed

beforeAll(async () => {
  await payload.init({
    config: config,
  })

  for (const collection of (await config).collections) {
    await payload.delete({
      collection: collection.slug,
      where: {},
    })
  }
})

afterAll(async () => {
  // terminate the connection to the database
  if (typeof payload.db.destroy === 'function') {
    await payload.db.destroy()
  }
})

describe('Path and breadcrumb virtual fields are returned correctly for find operation.', () => {
  describe('Nested document with all locales created.', () => {
    const rootPageDataDe = {
      title: 'Root Page DE',
      slug: 'root-page-de',
      content: 'Root Page DE',
    }
    const rootPageDataEn = {
      title: 'Root Page EN',
      slug: 'root-page-en',
      content: 'Root Page EN',
    }
    const nestedPageDataDe = {
      title: 'Nested Page DE',
      slug: 'nested-page-de',
      content: 'Nested Page DE',
    }
    const nestedPageDataEn = {
      title: 'Nested Page EN',
      slug: 'nested-page-en',
      content: 'Nested Page EN',
    }
    let rootPageId: string | undefined // will be set in the beforeEach hook
    let nestedPageId: string | undefined // will be set in the beforeEach hook

    beforeAll(async () => {
      // ################# Seed the database for the tests of this group #################

      rootPageId = (
        await payload.create({
          collection: 'pages',
          locale: 'de',
          // @ts-ignore
          data: rootPageDataDe,
        })
      ).id

      await payload.update({
        collection: 'pages',
        id: rootPageId,
        locale: 'en',
        // @ts-ignore
        data: rootPageDataEn,
      })

      nestedPageId = (
        await payload.create({
          collection: 'pages',
          locale: 'de',
          // @ts-ignore
          data: { ...nestedPageDataDe, parent: rootPageId },
        })
      ).id

      await payload.update({
        collection: 'pages',
        id: nestedPageId,
        locale: 'en',
        // @ts-ignore
        data: { ...nestedPageDataEn, parent: rootPageId },
      })
    })

    describe('Breadcrumbs', () => {
      test('All locales requested.', async () => {
        const nestedPage = await payload.findByID({
          collection: 'pages',
          id: nestedPageId!,
          locale: 'all',
        })

        expect(nestedPage).toBeDefined()

        // Breadcrumbs must be an object containing the breadcrumbs for all locales
        expect(typeof nestedPage.breadcrumbs).toBe('object')

        // Breadcrumbs must be correctly set
        expect(nestedPage.breadcrumbs).toStrictEqual({
          de: [
            {
              id: nestedPage.breadcrumbs['de'][0]?.id,
              label: rootPageDataDe.title,
              slug: rootPageDataDe.slug,
              path: `/de/${rootPageDataDe.slug}`,
            },
            {
              id: nestedPage.breadcrumbs['de'][1]?.id,
              label: nestedPageDataDe.title,
              slug: nestedPageDataDe.slug,
              path: `/de/${rootPageDataDe.slug}/${nestedPageDataDe.slug}`,
            },
          ],
          en: [
            {
              id: nestedPage.breadcrumbs['en'][0]?.id,
              label: rootPageDataEn.title,
              slug: rootPageDataEn.slug,
              path: `/en/${rootPageDataEn.slug}`,
            },
            {
              id: nestedPage.breadcrumbs['en'][1]?.id,
              label: nestedPageDataEn.title,
              slug: nestedPageDataEn.slug,
              path: `/en/${rootPageDataEn.slug}/${nestedPageDataEn.slug}`,
            },
          ],
        })
      })

      test('One locale requested.', async () => {
        const nestedPage = await payload.findByID({
          collection: 'pages',
          id: nestedPageId!,
          locale: 'de',
        })

        expect(nestedPage).toBeDefined()

        // Breadcrumbs must be an object containing the breadcrumbs for all locales
        expect(Array.isArray(nestedPage.breadcrumbs)).toBe(true)

        // Breadcrumbs must be correctly set
        expect(nestedPage.breadcrumbs).toStrictEqual([
          {
            id: nestedPage.breadcrumbs[0].id,
            label: rootPageDataDe.title,
            slug: rootPageDataDe.slug,
            path: `/de/${rootPageDataDe.slug}`,
          },
          {
            id: nestedPage.breadcrumbs[1].id,
            label: nestedPageDataDe.title,
            slug: nestedPageDataDe.slug,
            path: `/de/${rootPageDataDe.slug}/${nestedPageDataDe.slug}`,
          },
        ])
      })
    })

    describe('Path', () => {
      test('All locales requested.', async () => {
        const nestedPage = await payload.findByID({
          collection: 'pages',
          id: nestedPageId!,
          locale: 'all',
        })

        expect(nestedPage).toBeDefined()
        expect(nestedPage.path).toBeDefined()
        expect(typeof nestedPage.path).toBe('object')

        expect(nestedPage.path).toStrictEqual({
          de: `/de/${rootPageDataDe.slug}/${nestedPageDataDe.slug}`,
          en: `/en/${rootPageDataEn.slug}/${nestedPageDataEn.slug}`,
        })
      })

      test('One locale requested.', async () => {
        const nestedPage = await payload.findByID({
          collection: 'pages',
          id: nestedPageId!,
          locale: 'de',
        })

        expect(nestedPage).toBeDefined()
        expect(nestedPage.path).toBeDefined()
        expect(typeof nestedPage.path).toBe('string')

        expect(nestedPage.path).toStrictEqual(`/de/${rootPageDataDe.slug}/${nestedPageDataDe.slug}`)
      })
    })

    describe('AlternatePaths', () => {
      test('All locales requested.', async () => {
        const nestedPage = await payload.findByID({
          collection: 'pages',
          id: nestedPageId!,
          locale: 'all',
        })

        expect(nestedPage).toBeDefined()
        expect(nestedPage.meta.alternatePaths).toBeDefined()
        expect(Array.isArray(nestedPage.meta.alternatePaths)).toBe(true)

        expect(nestedPage.meta.alternatePaths).toStrictEqual([
          {
            hreflang: 'de',
            path: `/de/${rootPageDataDe.slug}/${nestedPageDataDe.slug}`,
          },
          {
            hreflang: 'en',
            path: `/en/${rootPageDataEn.slug}/${nestedPageDataEn.slug}`,
          },
        ])
      })

      test('One locale requested.', async () => {
        const nestedPage = await payload.findByID({
          collection: 'pages',
          id: nestedPageId!,
          locale: 'de',
        })

        expect(nestedPage).toBeDefined()
        expect(nestedPage.meta.alternatePaths).toBeDefined()
        expect(Array.isArray(nestedPage.meta.alternatePaths)).toBe(true)

        expect(nestedPage.meta.alternatePaths).toStrictEqual([
          {
            hreflang: 'de',
            path: `/de/${rootPageDataDe.slug}/${nestedPageDataDe.slug}`,
          },
          {
            hreflang: 'en',
            path: `/en/${rootPageDataEn.slug}/${nestedPageDataEn.slug}`,
          },
        ])
      })
    })
  })

  describe('Nested document with one locale created.', () => {
    const rootPageDataDe = {
      title: 'Root Page DE',
      slug: 'root-page-de-1',
      content: 'Root Page DE',
    }
    const nestedPageDataDe = {
      title: 'Nested Page DE',
      slug: 'nested-page-de-1',
      content: 'Nested Page DE',
    }
    let rootPageId: string | undefined // will be set in the beforeEach hook
    let nestedPageId: string | undefined // will be set in the beforeEach hook

    beforeAll(async () => {
      // ################# Seed the database for the tests of this group #################

      rootPageId = (
        await payload.create({
          collection: 'pages',
          locale: 'de',
          // @ts-ignore
          data: rootPageDataDe,
        })
      ).id

      nestedPageId = (
        await payload.create({
          collection: 'pages',
          locale: 'de',
          // @ts-ignore
          data: { ...nestedPageDataDe, parent: rootPageId },
        })
      ).id
    })

    describe('Breadcrumbs', () => {
      test('All locales requested.', async () => {
        const nestedPage = await payload.findByID({
          collection: 'pages',
          id: nestedPageId!,
          locale: 'all',
        })

        expect(nestedPage).toBeDefined()

        // Breadcrumbs must be an object containing the breadcrumbs for all locales
        expect(typeof nestedPage.breadcrumbs).toBe('object')

        // Breadcrumbs must be correctly set
        expect(nestedPage.breadcrumbs).toStrictEqual({
          de: [
            {
              id: nestedPage.breadcrumbs['de'][0]?.id,
              label: rootPageDataDe.title,
              slug: rootPageDataDe.slug,
              path: `/de/${rootPageDataDe.slug}`,
            },
            {
              id: nestedPage.breadcrumbs['de'][1]?.id,
              label: nestedPageDataDe.title,
              slug: nestedPageDataDe.slug,
              path: `/de/${rootPageDataDe.slug}/${nestedPageDataDe.slug}`,
            },
          ],
          // TODO: After revising the implementation, change this to be undefined
          // Note: When the doc is not defined in en, the plugin should not return breadcrumbs for en!
          en: [
            {
              id: nestedPage.breadcrumbs['en'][0]?.id,
              label: {
                de: 'Root Page DE',
              },
              path: '/en',
              slug: undefined,
            },
            {
              id: nestedPage.breadcrumbs['en'][1]?.id,
              label: {
                de: 'Nested Page DE',
              },
              path: '/en',
              slug: undefined,
            },
          ],
        })
      })

      test('One locale requested.', async () => {
        const nestedPage = await payload.findByID({
          collection: 'pages',
          id: nestedPageId!,
          locale: 'de',
        })

        expect(nestedPage).toBeDefined()

        // Breadcrumbs must be an object containing the breadcrumbs for all locales
        expect(Array.isArray(nestedPage.breadcrumbs)).toBe(true)

        // Breadcrumbs must be correctly set
        expect(nestedPage.breadcrumbs).toStrictEqual([
          {
            id: nestedPage.breadcrumbs[0].id,
            label: rootPageDataDe.title,
            slug: rootPageDataDe.slug,
            path: `/de/${rootPageDataDe.slug}`,
          },
          {
            id: nestedPage.breadcrumbs[1].id,
            label: nestedPageDataDe.title,
            slug: nestedPageDataDe.slug,
            path: `/de/${rootPageDataDe.slug}/${nestedPageDataDe.slug}`,
          },
        ])
      })
    })

    describe('Path', () => {
      test('All locales requested.', async () => {
        const nestedPage = await payload.findByID({
          collection: 'pages',
          id: nestedPageId!,
          locale: 'all',
        })

        expect(nestedPage).toBeDefined()
        expect(nestedPage.path).toBeDefined()
        expect(typeof nestedPage.path).toBe('object')

        expect(nestedPage.path).toStrictEqual({
          de: `/de/${rootPageDataDe.slug}/${nestedPageDataDe.slug}`,
        })
      })

      test('One locale requested.', async () => {
        const nestedPage = await payload.findByID({
          collection: 'pages',
          id: nestedPageId!,
          locale: 'de',
        })

        expect(nestedPage).toBeDefined()
        expect(nestedPage.path).toBeDefined()
        expect(typeof nestedPage.path).toBe('string')

        expect(nestedPage.path).toStrictEqual(`/de/${rootPageDataDe.slug}/${nestedPageDataDe.slug}`)
      })
    })

    describe('AlternatePaths', () => {
      test('All locales requested.', async () => {
        const nestedPage = await payload.findByID({
          collection: 'pages',
          id: nestedPageId!,
          locale: 'all',
        })

        expect(nestedPage).toBeDefined()
        expect(nestedPage.meta.alternatePaths).toBeDefined()
        expect(Array.isArray(nestedPage.meta.alternatePaths)).toBe(true)

        expect(nestedPage.meta.alternatePaths).toStrictEqual([
          {
            hreflang: 'de',
            path: `/de/${rootPageDataDe.slug}/${nestedPageDataDe.slug}`,
          },
        ])
      })

      test('One locale requested.', async () => {
        const nestedPage = await payload.findByID({
          collection: 'pages',
          id: nestedPageId!,
          locale: 'de',
        })

        expect(nestedPage).toBeDefined()
        expect(nestedPage.meta.alternatePaths).toBeDefined()
        expect(Array.isArray(nestedPage.meta.alternatePaths)).toBe(true)

        expect(nestedPage.meta.alternatePaths).toStrictEqual([
          {
            hreflang: 'de',
            path: `/de/${rootPageDataDe.slug}/${nestedPageDataDe.slug}`,
          },
        ])
      })
    })
  })
})

describe('Path and breadcrumb virtual fields are set correctly for find operation with select.', () => {
  test('Only path and breadcrumbs are selected (not slug etc.)', async () => {
    const pageId = (
      await payload.create({
        collection: 'pages',
        locale: 'de',
        // @ts-ignore
        data: {
          title: 'Page DE',
          slug: 'page',
          content: 'Page DE',
        },
      })
    ).id

    const pageWithSelect = await payload.findByID({
      collection: 'pages',
      id: pageId,
      select: {
        path: true,
        breadcrumbs: true,
        alternatePaths: true,
      },
    })

    const pageWithoutSelect = await payload.findByID({
      collection: 'pages',
      id: pageId,
    })

    // Breadcrumbs must be an array
    expect(Array.isArray(pageWithSelect.breadcrumbs)).toBe(true)

    // Breadcrumbs array should match homePage breadcrumbs
    expect(removeIdsFromArray(pageWithSelect.breadcrumbs)).toEqual(
      removeIdsFromArray(pageWithoutSelect.breadcrumbs),
    )

    // Path must be defined and non-empty
    expect(pageWithSelect.path).toBeDefined()

    // Path must be defined and non-empty
    expect(pageWithSelect.path).toEqual(pageWithoutSelect.path)

    // AlternatePaths must be defined and non-empty
    expect(pageWithSelect.meta.alternatePaths).toBeDefined()

    // AlternatePaths must match homePage alternatePaths
    expect(pageWithSelect.meta.alternatePaths).toEqual(pageWithoutSelect.meta.alternatePaths)
  })
})

/**
 * Helper function to remove id field from objects in an array
 */
const removeIdsFromArray = <T extends { id?: any }>(array: T[]): Omit<T, 'id'>[] => {
  return array.map(({ id, ...rest }) => rest)
}
