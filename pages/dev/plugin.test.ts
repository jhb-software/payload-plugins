import payload from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import config from './src/payload.config'

// TODO: add the following tests:
// - redirects are sucessfully created when the slug of a doc changed

beforeAll(async () => {
  await payload.init({
    config: config,
  })

  for (const collection of (await config).collections.filter((c) => c.slug !== 'users')) {
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
  describe('The root page document', () => {
    beforeEach(async () => {
      await payload.delete({
        collection: 'pages',
        where: {},
      })
    })

    test('has the correct virtual fields when only one locale is present', async () => {
      const locale = 'de'
      const rootPageData = {
        title: 'Root Page DE',
        slug: '',
        content: 'Root Page DE',
        isRootPage: true,
      }

      const rootPageId = (
        await payload.create({
          collection: 'pages',
          locale,
          // @ts-ignore
          data: rootPageData,
        })
      ).id

      const rootPage = await payload.findByID({
        collection: 'pages',
        id: rootPageId,
        locale: locale,
      })

      const path = `/${locale}`

      expect(rootPage.slug).toBe('') // Plugin convention: The slug of the root page is an empty string.
      expect(rootPage.path).toBe(path)
      expect(removeIdsFromArray(rootPage.breadcrumbs)).toEqual(
        removeIdsFromArray([
          {
            path,
            label: rootPageData.title,
            slug: rootPageData.slug,
          },
        ]),
      )
      expect(removeIdsFromArray(rootPage.meta.alternatePaths)).toEqual(
        removeIdsFromArray([
          {
            hreflang: locale,
            path,
          },
        ]),
      )
    })

    test('has the correct virtual fields when all locales are present', async () => {
      const rootPageData = {
        de: {
          title: 'Root Page DE',
          slug: '',
          content: 'Root Page DE',
          isRootPage: true,
        },
        en: {
          title: 'Root Page EN',
          slug: '',
          content: 'Root Page EN',
          isRootPage: true,
        },
      }

      const rootPageId = (
        await payload.create({
          collection: 'pages',
          locale: 'de',
          // @ts-ignore
          data: rootPageData.de,
        })
      ).id

      await payload.update({
        collection: 'pages',
        id: rootPageId,
        locale: 'en',
        // @ts-ignore
        data: rootPageData.en,
      })

      const rootPage = await payload.findByID({
        collection: 'pages',
        id: rootPageId,
        locale: 'all',
      })

      expect(rootPage.slug).toEqual({
        de: '',
        en: '',
      })
      expect(rootPage.path).toEqual({
        de: '/de',
        en: '/en',
      })
      expect(removeIdsFromArray(rootPage.breadcrumbs.de)).toEqual(
        removeIdsFromArray([
          {
            path: '/de',
            label: rootPageData.de.title,
            slug: rootPageData.de.slug,
          },
        ]),
      )
      expect(removeIdsFromArray(rootPage.breadcrumbs.en)).toEqual(
        removeIdsFromArray([
          {
            path: '/en',
            label: rootPageData.en.title,
            slug: rootPageData.en.slug,
          },
        ]),
      )
      expect(removeIdsFromArray(rootPage.meta.alternatePaths)).toEqual(
        removeIdsFromArray([
          {
            hreflang: 'de',
            path: '/de',
          },
          {
            hreflang: 'en',
            path: '/en',
          },
        ]),
      )
    })
  })

  describe('Nested document in same collection with all locales created.', () => {
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
      await payload.delete({
        collection: 'pages',
        where: {},
      })

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

  describe('Nested document in same collection with one locale created.', () => {
    const rootPageDataDe = {
      title: 'Root Page DE',
      slug: 'root-page-de',
      content: 'Root Page DE',
    }
    const nestedPageDataDe = {
      title: 'Nested Page DE',
      slug: 'nested-page-de',
      content: 'Nested Page DE',
    }
    let rootPageId: string | undefined // will be set in the beforeEach hook
    let nestedPageId: string | undefined // will be set in the beforeEach hook

    beforeAll(async () => {
      await payload.delete({
        collection: 'pages',
        where: {},
      })

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
              label: undefined,
              path: '/en',
              slug: undefined,
            },
            {
              id: nestedPage.breadcrumbs['en'][1]?.id,
              label: undefined,
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

  test('Nested document across collections with one locale created.', async () => {
    const locale = 'de'
    const authorOverviewPageData = {
      title: 'Authors',
      slug: 'authors',
      content: 'Authors page',
    }
    const authorPageData = {
      name: 'Test Author',
      slug: 'test-author',
      content: 'Test Author',
    }

    const authorOverviewPageId = (
      await payload.create({
        collection: 'pages',
        locale,
        data: authorOverviewPageData,
      })
    ).id

    const authorPageId = (
      await payload.create({
        collection: 'authors',
        locale,
        data: { ...authorPageData, parent: authorOverviewPageId },
      })
    ).id

    // Verify the author was created and linked correctly
    const author = await payload.findByID({
      collection: 'authors',
      depth: 0,
      id: authorPageId,
    })

    expect(author).toBeDefined()
    expect(author.parent).toBe(authorOverviewPageId)

    // Verify path is correctly set
    expect(author.path).toBe(`/${locale}/${authorOverviewPageData.slug}/${authorPageData.slug}`)

    // Verify breadcrumbs are correctly set
    expect(author.breadcrumbs).toBeDefined()
    expect(removeIdsFromArray(author.breadcrumbs)).toEqual([
      {
        label: authorOverviewPageData.title,
        path: `/${locale}/${authorOverviewPageData.slug}`,
        slug: authorOverviewPageData.slug,
      },
      {
        label: authorPageData.name,
        path: `/${locale}/${authorOverviewPageData.slug}/${authorPageData.slug}`,
        slug: authorPageData.slug,
      },
    ])

    // Verify alternatePaths are correctly set
    expect(author.meta.alternatePaths).toBeDefined()
    expect(author.meta.alternatePaths).toEqual([
      {
        hreflang: locale,
        path: `/${locale}/${authorOverviewPageData.slug}/${authorPageData.slug}`,
      },
    ])
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

describe('Slug field behaves as expected for updates', () => {
  test('Slug remains unchanged when title is updated', async () => {
    // Create initial page
    const initialData = {
      title: 'Initial Title',
      content: 'Some content',
      slug: 'initial-title',
    }

    const page = await payload.create({
      collection: 'pages',
      data: initialData,
    })

    expect(page.slug).toBe('initial-title')

    // Update the title
    const updatedPage = await payload.update({
      collection: 'pages',
      id: page.id,
      data: {
        title: 'Updated Title',
      },
    })

    // Verify slug remains unchanged
    expect(updatedPage.slug).toBe('initial-title')
    expect(updatedPage.title).toBe('Updated Title')
  })

  test('Slug falls back to title when not provided', async () => {
    // Create page without providing a slug
    const pageData = {
      title: 'Test Page Title',
      content: 'Some content',
    }

    const page = await payload.create({
      collection: 'pages',
      data: pageData,
    })

    // Verify slug was set based on title
    expect(page.slug).toBe('test-page-title')
    expect(page.title).toBe('Test Page Title')
  })

  test('Root page is created with an empty slug and remains empty even when updated', async () => {
    // Create initial root page without providing a slug
    const initialData = {
      title: 'Root Page',
      content: 'Root page content',
      isRootPage: true,
    }

    const rootPage = await payload.create({
      collection: 'pages',
      data: initialData,
    })

    // Verify the slug is empty
    expect(rootPage.slug).toBe('')
    expect(rootPage.isRootPage).toBe(true)

    // Try to update the slug
    const updatedRootPage = await payload.update({
      collection: 'pages',
      id: rootPage.id,
      data: {
        slug: 'attempted-slug',
        title: 'Updated Root Page',
      },
    })

    // Verify slug remains empty after update
    expect(updatedRootPage.slug).toBe('')
    expect(updatedRootPage.title).toBe('Updated Root Page')
    expect(updatedRootPage.isRootPage).toBe(true)
  })
})

/**
 * Helper function to remove id field from objects in an array
 */
const removeIdsFromArray = <T extends { id?: any }>(array: T[]): Omit<T, 'id'>[] => {
  return array.map(({ id, ...rest }) => rest)
}
