import payload, { ValidationError } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import config from './src/payload.config'

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
  if (payload.db && typeof payload.db.destroy === 'function') {
    await payload.db.destroy()
  } else {
    console.log('Could not destroy database')
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

    test('has the correct virtual fields', async () => {
      const rootPageData = {
        title: 'Root Page',
        slug: '',
        content: 'Root Page',
        isRootPage: true,
      }

      const rootPageId = (
        await payload.create({
          collection: 'pages',
          // @ts-ignore
          data: rootPageData,
        })
      ).id

      const rootPage = await payload.findByID({
        collection: 'pages',
        id: rootPageId,
      })

      const path = `/`

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
    })
  })

  describe('Nested document in same collection.', () => {
    const rootPageData = {
      title: 'Root Page',
      slug: 'root-page',
      content: 'Root Page',
    }
    const nestedPageData = {
      title: 'Nested Page',
      slug: 'nested-page',
      content: 'Nested Page',
    }
    let rootPageId: string | number | undefined // will be set in the beforeEach hook
    let nestedPageId: string | number | undefined // will be set in the beforeEach hook

    beforeAll(async () => {
      await payload.delete({
        collection: 'pages',
        where: {},
      })

      // ################# Seed the database for the tests of this group #################

      rootPageId = (
        await payload.create({
          collection: 'pages',
          // @ts-expect-error
          data: rootPageData,
        })
      ).id

      await payload.update({
        collection: 'pages',
        id: rootPageId,
        data: rootPageData,
      })

      nestedPageId = (
        await payload.create({
          collection: 'pages',
          // @ts-expect-error
          data: { ...nestedPageData, parent: rootPageId },
        })
      ).id

      await payload.update({
        collection: 'pages',
        id: nestedPageId,
        data: { ...nestedPageData, parent: rootPageId },
      })
    })

    describe('Breadcrumbs', () => {
      test('are correctly set when requested.', async () => {
        const nestedPage = await payload.findByID({
          collection: 'pages',
          id: nestedPageId!,
        })

        expect(nestedPage).toBeDefined()

        // Breadcrumbs must be an array
        expect(Array.isArray(nestedPage.breadcrumbs)).toBe(true)

        // Breadcrumbs must be correctly set
        expect(nestedPage.breadcrumbs).toStrictEqual([
          {
            id: nestedPage.breadcrumbs[0]?.id,
            label: rootPageData.title,
            slug: rootPageData.slug,
            path: `/${rootPageData.slug}`,
          },
          {
            id: nestedPage.breadcrumbs[1]?.id,
            label: nestedPageData.title,
            slug: nestedPageData.slug,
            path: `/${rootPageData.slug}/${nestedPageData.slug}`,
          },
        ])
      })
    })

    describe('Path', () => {
      test('is correctly set when requested.', async () => {
        const nestedPage = await payload.findByID({
          collection: 'pages',
          id: nestedPageId!,
        })

        expect(nestedPage).toBeDefined()
        expect(nestedPage.path).toBeDefined()
        expect(typeof nestedPage.path).toBe('string')

        expect(nestedPage.path).toStrictEqual(`/${rootPageData.slug}/${nestedPageData.slug}`)
      })
    })
  })

  describe('Nested document in same collection.', () => {
    const rootPageData = {
      title: 'Root Page',
      slug: 'root-page',
      content: 'Root Page',
    }
    const nestedPageData = {
      title: 'Nested Page',
      slug: 'nested-page',
      content: 'Nested Page',
    }
    let rootPageId: string | number | undefined // will be set in the beforeEach hook
    let nestedPageId: string | number | undefined // will be set in the beforeEach hook

    beforeAll(async () => {
      await payload.delete({
        collection: 'pages',
        where: {},
      })

      // ################# Seed the database for the tests of this group #################

      rootPageId = (
        await payload.create({
          collection: 'pages',
          // @ts-expect-error
          data: rootPageData,
        })
      ).id

      nestedPageId = (
        await payload.create({
          collection: 'pages',
          // @ts-expect-error
          data: { ...nestedPageData, parent: rootPageId },
        })
      ).id
    })

    describe('Breadcrumbs', () => {
      test('are correctly set when requested.', async () => {
        const nestedPage = await payload.findByID({
          collection: 'pages',
          id: nestedPageId!,
        })

        expect(nestedPage).toBeDefined()

        // Breadcrumbs must be an array
        expect(Array.isArray(nestedPage.breadcrumbs)).toBe(true)

        // Breadcrumbs must be correctly set
        expect(nestedPage.breadcrumbs).toStrictEqual([
          {
            id: nestedPage.breadcrumbs[0]?.id,
            label: rootPageData.title,
            slug: rootPageData.slug,
            path: `/${rootPageData.slug}`,
          },
          {
            id: nestedPage.breadcrumbs[1]?.id,
            label: nestedPageData.title,
            slug: nestedPageData.slug,
            path: `/${rootPageData.slug}/${nestedPageData.slug}`,
          },
        ])
      })
    })

    describe('Path', () => {
      test('is correctly set when requested.', async () => {
        const nestedPage = await payload.findByID({
          collection: 'pages',
          id: nestedPageId!,
        })

        expect(nestedPage).toBeDefined()
        expect(nestedPage.path).toBeDefined()
        expect(typeof nestedPage.path).toBe('string')

        expect(nestedPage.path).toStrictEqual(`/${rootPageData.slug}/${nestedPageData.slug}`)
      })
    })
  })

  test('Nested document across collections.', async () => {
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
        // @ts-expect-error
        data: authorOverviewPageData,
      })
    ).id

    const authorPageId = (
      await payload.create({
        collection: 'authors',
        // @ts-expect-error
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
    expect(author.path).toBe(`/${authorOverviewPageData.slug}/${authorPageData.slug}`)

    // Verify breadcrumbs are correctly set
    expect(author.breadcrumbs).toBeDefined()
    expect(removeIdsFromArray(author.breadcrumbs)).toEqual([
      {
        label: authorOverviewPageData.title,
        path: `/${authorOverviewPageData.slug}`,
        slug: authorOverviewPageData.slug,
      },
      {
        label: authorPageData.name,
        path: `/${authorOverviewPageData.slug}/${authorPageData.slug}`,
        slug: authorPageData.slug,
      },
    ])
  })
})

describe('Path and breadcrumb virtual fields are set correctly for find operation with select.', () => {
  test('Only path and breadcrumbs are selected (not slug etc.)', async () => {
    const pageId = (
      await payload.create({
        collection: 'pages',
        // @ts-expect-error
        data: {
          title: 'Page',
          slug: 'page',
          content: 'Page',
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
    // Delete any existing root page
    await payload.delete({
      collection: 'pages',
      where: {
        slug: '',
      },
    })

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

/**
 * Helper function to remove id field from objects in an array
 */
const removeIdsFromArray = <T extends { id?: any }>(array: T[]): Omit<T, 'id'>[] => {
  return array.map(({ id, ...rest }) => rest)
}
