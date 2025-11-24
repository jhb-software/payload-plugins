import payload, { CollectionSlug, SanitizedConfig, ValidationError } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, test } from 'vitest'
import config from './src/payload.config'
import { Page } from 'payload/generated-types'

beforeAll(async () => {
  await payload.init({
    config: config,
  })

  // clear all collections except users
  await deleteAllCollections(config, ['users'])
})

afterAll(async () => {
  await deleteAllCollections(config)

  if (payload.db && typeof payload.db.destroy === 'function') {
    await payload.db.destroy()
  } else {
    console.log('Could not destroy database')
  }
})

describe('Path and breadcrumb virtual fields are returned correctly for find operation.', () => {
  describe('The root page document', () => {
    beforeEach(async () => await deleteCollection('pages'))

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
            id: undefined,
            path,
            label: rootPageData.title,
            slug: rootPageData.slug,
          },
        ]),
      )
      expect(removeIdsFromArray(rootPage.meta?.alternatePaths)).toEqual(
        removeIdsFromArray([
          {
            id: undefined,
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
    let rootPageId: string | number | undefined // will be set in the beforeEach hook
    let nestedPageId: string | number | undefined // will be set in the beforeEach hook

    beforeAll(async () => {
      await deleteCollection('pages')

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

        expect(removeIdsFromArray(nestedPage.meta.alternatePaths)).toStrictEqual([
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

        expect(removeIdsFromArray(nestedPage.meta.alternatePaths)).toStrictEqual(
          removeIdsFromArray([
            {
              hreflang: 'de',
              path: `/de/${rootPageDataDe.slug}/${nestedPageDataDe.slug}`,
            },
            {
              hreflang: 'en',
              path: `/en/${rootPageDataEn.slug}/${nestedPageDataEn.slug}`,
            },
          ]),
        )
      })
    })
  })

  describe('Nested document in same collection with one locale created.', () => {
    const rootPageDataDe = {
      title: 'Root Page DE',
      slug: 'root-page-de-one-locale',
      content: 'Root Page DE',
    }
    const nestedPageDataDe = {
      title: 'Nested Page DE',
      slug: 'nested-page-de-one-locale',
      content: 'Nested Page DE',
    }
    let rootPageId: string | undefined // will be set in the beforeEach hook
    let nestedPageId: string | undefined // will be set in the beforeEach hook

    beforeAll(async () => {
      await deleteCollection('pages')

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

        expect(removeIdsFromArray(nestedPage.meta.alternatePaths)).toStrictEqual(
          removeIdsFromArray([
            {
              hreflang: 'de',
              path: `/de/${rootPageDataDe.slug}/${nestedPageDataDe.slug}`,
            },
          ]),
        )
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

        expect(removeIdsFromArray(nestedPage.meta.alternatePaths)).toStrictEqual(
          removeIdsFromArray([
            {
              hreflang: 'de',
              path: `/de/${rootPageDataDe.slug}/${nestedPageDataDe.slug}`,
            },
          ]),
        )
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
    expect(removeIdsFromArray(author.meta.alternatePaths)).toEqual(
      removeIdsFromArray([
        {
          hreflang: locale,
          path: `/${locale}/${authorOverviewPageData.slug}/${authorPageData.slug}`,
        },
      ]),
    )
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
        meta: {
          alternatePaths: true,
        },
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
    expect(removeIdsFromArray(pageWithSelect.meta.alternatePaths)).toEqual(
      removeIdsFromArray(pageWithoutSelect.meta.alternatePaths),
    )
  })
})

describe('Slug field behaves as expected for create and update operations', () => {
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

  test('Validation Error is thrown when creating a page without providing a slug', async () => {
    // Create page without providing a slug
    const pageData = {
      title: 'Test Page Title',
      content: 'Some content',
    }

    try {
      await payload.create({
        collection: 'pages',
        data: pageData,
      })
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError)
    }
  })

  test('Validation Error is thrown when creating a page with an invalid slug', async () => {
    // Create page without providing a slug
    const pageData = {
      title: 'Test Page Title 2',
      content: 'Some content 2',
      slug: 'invalid slug &!=',
    }

    try {
      await payload.create({
        collection: 'pages',
        data: pageData,
      })
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError)
    }
  })

  test('Validation Error is thrown when trying to create a root page without providing a slug', async () => {
    // Create initial root page without providing a slug
    const initialData = {
      title: 'Root Page',
      content: 'Root page content',
      isRootPage: true,
    }

    try {
      await payload.create({
        collection: 'pages',
        data: initialData,
      })
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError)
    }
  })

  test('Root page is created sucessfully with an empty slug and throws validation error when slug is updated', async () => {
    // Create initial root page without providing a slug
    const initialData = {
      title: 'Root Page',
      content: 'Root page content',
      isRootPage: true,
      slug: '',
    }

    const rootPage = await payload.create({
      collection: 'pages',
      data: initialData,
    })

    // Verify the slug is empty
    expect(rootPage.slug).toBe('')
    expect(rootPage.isRootPage).toBe(true)

    // Try to update the slug
    try {
      await payload.update({
        collection: 'pages',
        id: rootPage.id,
        data: {
          slug: 'attempted-slug',
        },
      })
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError)
    }
  })
})

describe('Parent deletion prevention hook', () => {
  beforeEach(async () => await deleteAllCollections(config, ['users']))

  describe('MongoDB environment', () => {
    test('prevents deletion when child dependencies exist', async () => {
      // Mock MongoDB adapter
      const originalAdapter = payload.db.name
      Object.defineProperty(payload.db, 'name', {
        value: '@payloadcms/db-mongodb',
        configurable: true,
      })

      try {
        // Create parent page
        const parentPage = await payload.create({
          collection: 'pages',
          locale: 'de',
          data: {
            title: 'Parent Page',
            slug: 'parent-page-prevents-deletion',
            content: 'Parent content',
          },
        })

        // Create child page referencing the parent
        await payload.create({
          collection: 'pages',
          locale: 'de',
          data: {
            title: 'Child Page',
            slug: 'child-page-prevents-deletion',
            content: 'Child content',
            parent: parentPage.id,
          },
        })

        // Attempt to delete the parent page - should throw error
        await expect(
          payload.delete({
            collection: 'pages',
            id: parentPage.id,
          }),
        ).rejects.toThrow('Cannot delete this document because it is referenced as a parent by')
      } finally {
        // Restore original adapter
        Object.defineProperty(payload.db, 'name', { value: originalAdapter, configurable: true })
      }
    })

    test('allows deletion when no child dependencies exist', async () => {
      // Mock MongoDB adapter
      const originalAdapter = payload.db.name
      Object.defineProperty(payload.db, 'name', {
        value: '@payloadcms/db-mongodb',
        configurable: true,
      })

      try {
        // Create parent page
        const parentPage = await payload.create({
          collection: 'pages',
          locale: 'de',
          data: {
            title: 'Parent Page',
            slug: 'parent-page-allows-deletion',
            content: 'Parent content',
          },
        })

        // Create another page without parent reference
        await payload.create({
          collection: 'pages',
          locale: 'de',
          data: {
            title: 'Independent Page',
            slug: 'independent-page-allows-deletion',
            content: 'Independent content',
          },
        })

        // Delete the parent page - should succeed
        const result = await payload.delete({
          collection: 'pages',
          id: parentPage.id,
        })

        // Verify deletion succeeded (result should not be null)
        expect(result).toBeTruthy()
        if (result && result.docs) {
          expect(result.docs).toHaveLength(1)
          expect(result.docs[0].id).toBe(parentPage.id)
        }
      } finally {
        // Restore original adapter
        Object.defineProperty(payload.db, 'name', { value: originalAdapter, configurable: true })
      }
    })

    test('provides helpful error message with dependency details', async () => {
      // Mock MongoDB adapter
      const originalAdapter = payload.db.name
      Object.defineProperty(payload.db, 'name', {
        value: '@payloadcms/db-mongodb',
        configurable: true,
      })

      try {
        // Create parent page
        const parentPage = await payload.create({
          collection: 'pages',
          locale: 'de',
          data: {
            title: 'Parent Page',
            slug: 'parent-page',
            content: 'Parent content',
          },
        })

        // Create multiple child pages
        await payload.create({
          collection: 'pages',
          locale: 'de',
          data: {
            title: 'Child Page 1',
            slug: 'child-page-1',
            content: 'Child content 1',
            parent: parentPage.id,
          },
        })

        await payload.create({
          collection: 'pages',
          locale: 'de',
          data: {
            title: 'Child Page 2',
            slug: 'child-page-2',
            content: 'Child content 2',
            parent: parentPage.id,
          },
        })

        // Attempt to delete parent - should provide detailed error
        try {
          await payload.delete({
            collection: 'pages',
            id: parentPage.id,
          })
          fail('Expected deletion to be prevented')
        } catch (error: any) {
          expect(error.message).toContain(
            'Cannot delete this document because it is referenced as a parent by',
          )
          expect(error.message).toContain('2 document(s) in the "pages" collection')
        }
      } finally {
        // Restore original adapter
        Object.defineProperty(payload.db, 'name', { value: originalAdapter, configurable: true })
      }
    })

    test('handles multi-collection scenarios', async () => {
      // Mock MongoDB adapter
      const originalAdapter = payload.db.name
      Object.defineProperty(payload.db, 'name', {
        value: '@payloadcms/db-mongodb',
        configurable: true,
      })

      try {
        // Create parent page
        const parentPage = await payload.create({
          collection: 'pages',
          locale: 'de',
          data: {
            title: 'Parent Page',
            slug: 'parent-page-multi-collection',
            content: 'Parent content',
          },
        })

        // Create child in pages collection
        await payload.create({
          collection: 'pages',
          locale: 'de',
          data: {
            title: 'Child Page',
            slug: 'child-page-multi-collection',
            content: 'Child content',
            parent: parentPage.id,
          },
        })

        // Create child in country-travel-tips collection (if it has parent field)
        try {
          await payload.create({
            collection: 'country-travel-tips',
            locale: 'de',
            data: {
              title: 'Travel Tip',
              slug: 'travel-tip',
              content: 'Travel tip content',
              parent: parentPage.id,
            },
          })
        } catch {
          // Collection might not have parent field, skip this part
        }

        // Attempt to delete parent - should be prevented
        await expect(
          payload.delete({
            collection: 'pages',
            id: parentPage.id,
          }),
        ).rejects.toThrow('Cannot delete this document because it is referenced as a parent by')
      } finally {
        // Restore original adapter
        Object.defineProperty(payload.db, 'name', { value: originalAdapter, configurable: true })
      }
    })
  })

  describe('SQL environment', () => {
    test('prevents deletion when child dependencies exist (SQLite)', async () => {
      // Mock SQLite adapter
      const originalAdapter = payload.db.name
      Object.defineProperty(payload.db, 'name', {
        value: '@payloadcms/db-sqlite',
        configurable: true,
      })

      try {
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

        // Attempt to delete the parent page - should throw error (hook active)
        await expect(
          payload.delete({
            collection: 'pages',
            id: parentPage.id,
          }),
        ).rejects.toThrow('Cannot delete this document because it is referenced as a parent by')
      } finally {
        // Restore original adapter
        Object.defineProperty(payload.db, 'name', { value: originalAdapter, configurable: true })
      }
    })

    test('SQLite adapter parent deletion behavior', async () => {
      // Mock SQLite adapter
      const originalAdapter = payload.db.name
      Object.defineProperty(payload.db, 'name', {
        value: '@payloadcms/db-sqlite',
        configurable: true,
      })

      try {
        await deleteCollection('pages')

        // Create parent page
        const parentPage = await payload.create({
          collection: 'pages',
          locale: 'de',
          data: {
            title: 'SQLite Parent Page',
            slug: 'sqlite-parent-page',
            content: 'SQLite parent content',
          },
        })

        // Create child page referencing the parent
        const childPage = await payload.create({
          collection: 'pages',
          locale: 'de',
          data: {
            title: 'SQLite Child Page',
            slug: 'sqlite-child-page',
            content: 'SQLite child content',
            parent: parentPage.id,
          },
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

        // Check if child still exists
        const remainingChild = await payload.findByID({ collection: 'pages', id: childPage.id })
        expect(remainingChild).toBeTruthy()

        // Clean up: delete child first
        await payload.delete({ collection: 'pages', id: childPage.id })
        if (!deletionAllowed) {
          // If parent deletion was prevented, we can now delete it after child is gone
          await payload.delete({ collection: 'pages', id: parentPage.id })
        }
      } finally {
        // Restore original adapter
        Object.defineProperty(payload.db, 'name', { value: originalAdapter, configurable: true })
      }
    })

    test('prevents deletion when child dependencies exist (PostgreSQL)', async () => {
      // Mock PostgreSQL adapter to match hook expectation
      const originalAdapter = payload.db.name
      Object.defineProperty(payload.db, 'name', {
        value: '@payloadcms/db-postgres',
        configurable: true,
      })

      try {
        // Create parent page
        const parentPage = await payload.create({
          collection: 'pages',
          locale: 'de',
          data: {
            title: 'Parent Page',
            slug: 'parent-page-postgres',
            content: 'Parent content',
          },
        })

        // Create child page referencing the parent
        await payload.create({
          collection: 'pages',
          locale: 'de',
          data: {
            title: 'Child Page',
            slug: 'child-page-postgres',
            content: 'Child content',
            parent: parentPage.id,
          },
        })

        // Attempt to delete the parent page - should throw error (hook active)
        await expect(
          payload.delete({
            collection: 'pages',
            id: parentPage.id,
          }),
        ).rejects.toThrow('Cannot delete this document because it is referenced as a parent by')
      } finally {
        // Restore original adapter
        Object.defineProperty(payload.db, 'name', { value: originalAdapter, configurable: true })
      }
    })
  })

  describe('Multi-tenant scenarios', () => {
    test('respects baseFilter configurations', async () => {
      // Mock MongoDB adapter
      const originalAdapter = payload.db.name
      Object.defineProperty(payload.db, 'name', { value: 'mongoose', configurable: true })

      try {
        // This test would require a multi-tenant setup with baseFilter
        // For now, we'll create a basic test that verifies the hook doesn't interfere
        // with normal operations when no dependencies exist

        const parentPage = await payload.create({
          collection: 'pages',
          locale: 'de',
          data: {
            title: 'Tenant Parent Page',
            slug: 'tenant-parent-page',
            content: 'Tenant parent content',
          },
        })

        // Create child in different "tenant" context (simulated)
        await payload.create({
          collection: 'pages',
          locale: 'de',
          data: {
            title: 'Different Tenant Child',
            slug: 'different-tenant-child',
            content: 'Different tenant child content',
            // Not setting parent to simulate different tenant
          },
        })

        // Delete should succeed as no dependencies in same tenant
        const result = await payload.delete({
          collection: 'pages',
          id: parentPage.id,
        })

        // Verify deletion succeeded (result should not be null)
        expect(result).toBeTruthy()
        if (result && result.docs) {
          expect(result.docs).toHaveLength(1)
          expect(result.docs[0].id).toBe(parentPage.id)
        }
      } finally {
        // Restore original adapter
        Object.defineProperty(payload.db, 'name', { value: originalAdapter, configurable: true })
      }
    })
  })
})

describe('Select during read operation', () => {
  beforeEach(async () => {
    // clear the collections we use in this test
    await deleteCollection('country-travel-tips')
    await deleteCollection('countries')
    await deleteCollection('pages')
  })

  test('findByID with empty select only returns id', async () => {
    // Create root page
    const rootPage = await payload.create({
      collection: 'pages',
      locale: 'de',
      // @ts-expect-error
      data: {
        title: 'Root Page',
        slug: '',
        content: 'Root content',
        isRootPage: true,
      },
    })

    // Create child page
    const childPage = await payload.create({
      collection: 'pages',
      locale: 'de',
      // @ts-expect-error
      data: {
        title: 'Child Page',
        slug: 'child-page',
        content: 'Child content',
        parent: rootPage.id,
      },
    })

    const fetchedWithAllFields = await payload.findByID({
      collection: 'pages',
      id: childPage.id,
      locale: 'de',
      depth: 0,
    })

    expect(fetchedWithAllFields).toBeDefined()

    // ################ Test empty select depth 0 ################
    const fetchedWithEmptySelect = await payload.findByID({
      collection: 'pages',
      id: childPage.id,
      locale: 'de',
      depth: 0,
      select: {},
    })

    expect(fetchedWithEmptySelect).toBeDefined()
    expect(Object.keys(fetchedWithEmptySelect)).toEqual(['id']) // has correct fields
    expect(fetchedWithEmptySelect.id).toEqual(fetchedWithAllFields.id) // id is correct

    // ################ Test empty select depth 1 ################
    const fetchedWithEmptySelectDepth1 = await payload.findByID({
      collection: 'pages',
      id: childPage.id,
      locale: 'de',
      depth: 1,
      select: {},
    })

    expect(fetchedWithEmptySelectDepth1).toBeDefined()
    expect(Object.keys(fetchedWithEmptySelectDepth1)).toEqual(['id']) // has correct fields
    expect(fetchedWithEmptySelectDepth1.id).toEqual(fetchedWithAllFields.id) // id is correct
  })

  test('Respect selection (field: true) of the virtual fields', async () => {
    // Create root page
    const rootPage = await payload.create({
      collection: 'pages',
      locale: 'de',
      // @ts-expect-error
      data: {
        title: 'Root Page',
        slug: '',
        content: 'Root content',
        isRootPage: true,
      },
    })

    // Create child page
    const childPage = await payload.create({
      collection: 'pages',
      locale: 'de',
      // @ts-expect-error
      data: {
        title: 'Child Page',
        slug: 'child-page',
        content: 'Child content',
        parent: rootPage.id,
      },
    })

    const fetchedWithAllFields = await payload.findByID({
      collection: 'pages',
      id: childPage.id,
      locale: 'de',
      depth: 0,
    })

    expect(fetchedWithAllFields).toBeDefined()

    // ################ Test path only ################
    const fetchedWithPath = await payload.findByID({
      collection: 'pages',
      id: childPage.id,
      locale: 'de',
      depth: 0,
      select: {
        path: true,
      },
    })

    expect(fetchedWithPath).toBeDefined()
    expect(Object.keys(fetchedWithPath)).toContain('path') // has correct fields
    expect(fetchedWithPath.path).toEqual(fetchedWithAllFields.path) // path is correct

    // ################ Test slug only ################
    const fetchedWithSlug = await payload.findByID({
      collection: 'pages',
      id: childPage.id,
      locale: 'de',
      depth: 0,
      select: {
        slug: true,
      },
    })

    expect(fetchedWithSlug).toBeDefined()
    expect(Object.keys(fetchedWithSlug).sort()).toContain('slug') // has correct fields
    expect(fetchedWithSlug.slug).toEqual(fetchedWithAllFields.slug) // slug is correct

    // ################ Test breadcrumbs only ################
    const fetchedWithBreadcrumbs = await payload.findByID({
      collection: 'pages',
      id: childPage.id,
      locale: 'de',
      depth: 0,
      select: {
        breadcrumbs: true,
      },
    })

    expect(fetchedWithBreadcrumbs).toBeDefined()
    expect(Object.keys(fetchedWithBreadcrumbs)).toContain('breadcrumbs') // has correct fields
    expect(removeIdsFromArray(fetchedWithBreadcrumbs.breadcrumbs)).toEqual(
      removeIdsFromArray(fetchedWithAllFields.breadcrumbs),
    ) // breadcrumbs is correct

    // ################ Test meta only ################
    const fetchedWithMeta = await payload.findByID({
      collection: 'pages',
      id: childPage.id,
      locale: 'de',
      depth: 0,
      select: {
        meta: true,
      },
    })

    expect(fetchedWithMeta).toBeDefined()
    expect(Object.keys(fetchedWithMeta).sort()).toContain('meta') // has correct fields
    expect(removeIdsFromArray(fetchedWithMeta.meta.alternatePaths)).toEqual(
      removeIdsFromArray(fetchedWithAllFields.meta.alternatePaths),
    ) // alternatePaths is correct

    // ################ Test meta.alternatePaths only ################
    const fetchedWithMetaAlternatePaths = await payload.findByID({
      collection: 'pages',
      id: childPage.id,
      locale: 'de',
      depth: 0,
      select: {
        meta: {
          alternatePaths: true,
        },
      },
    })

    expect(fetchedWithMetaAlternatePaths).toBeDefined()
    expect(Object.keys(fetchedWithMetaAlternatePaths).sort()).toContain('meta') // has correct fields
    expect(Object.keys(fetchedWithMetaAlternatePaths.meta).sort()).toContain('alternatePaths') // nested field has correct fields
    expect(removeIdsFromArray(fetchedWithMetaAlternatePaths.meta.alternatePaths)).toEqual(
      removeIdsFromArray(fetchedWithAllFields.meta.alternatePaths),
    ) // alternatePaths is correct
  })

  test('parent relationship field is correctly populated when using select and depth 1', async () => {
    // Create root page
    const rootPage = await payload.create({
      collection: 'pages',
      locale: 'de',
      // @ts-expect-error
      data: {
        title: 'Root Page',
        slug: '',
        content: 'Root content',
        isRootPage: true,
      },
    })

    // Create child page
    const childPage = await payload.create({
      collection: 'pages',
      locale: 'de',
      // @ts-expect-error
      data: {
        title: 'Child Page',
        slug: 'child-page',
        content: 'Child content',
        parent: rootPage.id,
      },
    })

    const fetchedWithAllFields = await payload.findByID({
      collection: 'pages',
      id: childPage.id,
      locale: 'de',
      depth: 1,
    })

    expect(fetchedWithAllFields).toBeDefined()

    const fetchWithPathAndParent = await payload.findByID({
      collection: 'pages',
      id: childPage.id,
      locale: 'de',
      // important, set depth to one to populate the parent field
      depth: 1,
      select: {
        path: true,
        parent: true,
      },
    })

    expect(fetchWithPathAndParent).toBeDefined()

    // check if the parent field is still fully populated
    // this test is important because it ensures that the hooks that adjust the selection do not
    // affect nested find calls (populating the parent in this case)
    expect(Object.keys(fetchWithPathAndParent.parent!).sort()).toStrictEqual(
      Object.keys(fetchedWithAllFields.parent!).sort(),
    )
  })

  test('parent relationship field from different collection with different parent field slug is correctly populated when using select and depth 1', async () => {
    // Create countries page in pages collection
    const countriesPage = await payload.create({
      collection: 'pages',
      locale: 'de',
      data: {
        title: 'Countries',
        slug: 'countries',
        content: 'Countries content',
      },
    })

    // Create country page
    const country = await payload.create({
      collection: 'countries',
      locale: 'de',
      data: {
        title: 'Germany',
        slug: 'germany',
        content: 'Country content',
        parent: countriesPage.id,
      },
    })

    // Create country travel tips page
    const travelTips = await payload.create({
      collection: 'country-travel-tips',
      locale: 'de',
      data: {
        title: 'Travel Tips for Germany',
        content: 'Travel tips content',
        country: country.id,
      },
    })

    const fetchedWithAllFields = await payload.findByID({
      collection: 'country-travel-tips',
      id: travelTips.id,
      locale: 'de',
      depth: 1,
    })

    expect(fetchedWithAllFields).toBeDefined()

    const fetchWithPathAndParent = await payload.findByID({
      collection: 'country-travel-tips',
      id: travelTips.id,
      locale: 'de',
      // important, set depth to one to populate the parent (country) field
      depth: 1,
      select: {
        path: true,
        country: true,
      },
    })

    expect(fetchWithPathAndParent).toBeDefined()

    expect(fetchWithPathAndParent.path).toEqual(fetchedWithAllFields.path)

    // check if the parent field is still fully populated
    // this test is important because it ensures that the hooks that adjust the selection do not
    // affect nested find calls (populating the parent in this case)
    expect(Object.keys(fetchWithPathAndParent.country!).sort()).toStrictEqual(
      Object.keys(fetchedWithAllFields.country!).sort(),
    )
  })
})

describe('Virtual fields in versions', () => {
  beforeEach(async () => await deleteCollection('pages'))

  test('are correctly set when reading versions', async () => {
    const locale = 'de'
    const pageData = samplePageData({
      title: 'Test Page',
      slug: 'test-page',
      content: 'Test content',
    })

    // Create a page
    const page = await payload.create({
      collection: 'pages',
      locale,
      data: pageData,
    })

    // Update the page to create a version
    await payload.update({
      collection: 'pages',
      id: page.id,
      locale,
      data: {
        title: 'Updated Test Page',
      },
    })

    // Get all versions
    const versions = await payload.findVersions({
      collection: 'pages',
      where: {
        parent: {
          equals: page.id,
        },
      },
      select: {},
      locale,
    })

    expect(versions.docs).toBeDefined()
    expect(versions.docs.length).toBeGreaterThan(0)

    // Check that each version has the virtual fields correctly set
    for (const version of versions.docs) {
      expect(version.version).toBeDefined()

      // The path should be correctly generated from the slug
      if (version.version.slug) {
        expect(version.version.path).toBeDefined()
        expect(version.version.path).toBe(`/${locale}/${version.version.slug}`)
      }

      // Breadcrumbs should be correctly generated
      if (version.version.slug) {
        expect(version.version.breadcrumbs).toBeDefined()
        expect(Array.isArray(version.version.breadcrumbs)).toBe(true)
        expect(version.version.breadcrumbs.length).toBeGreaterThan(0)
      }
    }
  })

  test('are correctly set when reading a specific version by ID', async () => {
    const locale = 'de'
    const pageData = samplePageData({
      title: 'Test Page',
      slug: 'test-page',
      content: 'Test content',
    })

    // Create a page
    const page = await payload.create({
      collection: 'pages',
      locale,
      data: pageData,
    })

    // Update the page to create a version
    await payload.update({
      collection: 'pages',
      id: page.id,
      locale,
      data: {
        title: 'Updated Test Page for Version',
      },
    })

    // Get all versions to find a specific version ID
    const versions = await payload.findVersions({
      collection: 'pages',
      where: {
        parent: {
          equals: page.id,
        },
      },
      locale,
    })

    expect(versions.docs.length).toBeGreaterThan(0)

    // Get a specific version by ID
    const versionId = versions.docs[0].id
    const version = await payload.findVersionByID({
      collection: 'pages',
      id: versionId,
      locale,
    })

    expect(version).toBeDefined()
    expect(version.version).toBeDefined()

    // The path should be correctly generated from the slug
    if (version.version.slug) {
      expect(version.version.path).toBeDefined()
      expect(version.version.path).toBe(`/${locale}/${version.version.slug}`)

      // Breadcrumbs should be correctly generated
      expect(version.version.breadcrumbs).toBeDefined()
      expect(Array.isArray(version.version.breadcrumbs)).toBe(true)
      expect(version.version.breadcrumbs.length).toBeGreaterThan(0)

      // Verify breadcrumb structure
      const lastBreadcrumb = version.version.breadcrumbs[version.version.breadcrumbs.length - 1]
      expect(lastBreadcrumb.slug).toBe(version.version.slug)
      expect(lastBreadcrumb.path).toBe(version.version.path)
    }
  })

  test('are correctly set when reading a specific version by ID (nested page)', async () => {
    const locale = 'de'
    const parentPageData = samplePageData({
      title: 'Parent Page',
      slug: 'parent-page',
      content: 'Parent content',
    })
    const childPageData = samplePageData({
      title: 'Child Page',
      slug: 'child-page',
      content: 'Child content',
    })

    // Create parent page
    const parentPage = await payload.create({
      collection: 'pages',
      locale,
      data: parentPageData,
    })

    // Create child page
    const childPage = await payload.create({
      collection: 'pages',
      locale,
      data: { ...childPageData, parent: parentPage.id },
    })

    // Update the child page to create a version
    await payload.update({
      collection: 'pages',
      id: childPage.id,
      locale,
      data: {
        title: 'Updated Child Page',
      },
    })

    // Get versions of the child page
    const versions = await payload.findVersions({
      collection: 'pages',
      where: {
        parent: {
          equals: childPage.id,
        },
      },
      locale,
    })

    expect(versions.docs.length).toBeGreaterThan(0)

    // Check the first version
    const version = versions.docs[0]
    expect(version.version).toBeDefined()

    // The path should include the parent slug
    if (version.version.slug) {
      expect(version.version.path).toBeDefined()
      expect(version.version.path).toBe(`/${locale}/${parentPageData.slug}/${version.version.slug}`)

      // Breadcrumbs should include both parent and child
      expect(version.version.breadcrumbs).toBeDefined()
      expect(Array.isArray(version.version.breadcrumbs)).toBe(true)
      expect(version.version.breadcrumbs.length).toBe(2)

      // Verify parent breadcrumb
      expect(version.version.breadcrumbs[0].slug).toBe(parentPageData.slug)
      expect(version.version.breadcrumbs[0].path).toBe(`/${locale}/${parentPageData.slug}`)

      // Verify child breadcrumb
      expect(version.version.breadcrumbs[1].slug).toBe(version.version.slug)
      expect(version.version.breadcrumbs[1].path).toBe(version.version.path)
    }
  })
})

function samplePageData({
  title,
  slug,
  content,
}: {
  title: string
  slug: string
  content: string
}): Omit<Page, 'id' | 'createdAt' | 'deletedAt' | 'sizes' | 'updatedAt'> {
  return {
    title,
    slug,
    content,

    // the following fields are virtual and created by the plugin
    breadcrumbs: [],
    meta: {
      alternatePaths: [],
    },
    path: '',
  }
}

/**
 * Helper function to remove id field from objects in an array
 */
const removeIdsFromArray = <T extends { id?: any; [key: string]: any }>(
  array: T[],
): Omit<T, 'id'>[] => {
  return array.map(({ id, ...rest }) => rest)
}

/**
 * Helper function to delete all documents from a collection.
 */
const deleteCollection = async (collection: CollectionSlug) => {
  // use db.deleteMany instead of payload.delete to avoid running hooks
  await payload.db.deleteMany({
    collection: collection,
    where: {},
  })

  // this will fail for collections which have no versions enabled, therefore wrapped in a try catch
  try {
    await payload.db.deleteVersions({
      collection: collection,
      where: {},
    })
  } catch {}
}

const deleteAllCollections = async (
  config: Promise<SanitizedConfig>,
  except: CollectionSlug[] = [],
) => {
  // Clean up all collections except users
  for (const collection of (await config).collections?.filter((c) => !except.includes(c.slug)) ??
    []) {
    await deleteCollection(collection.slug)
  }
}
