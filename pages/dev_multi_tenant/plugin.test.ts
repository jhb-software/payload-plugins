import payload, { CollectionSlug } from 'payload'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import config from './src/payload.config'

beforeAll(async () => {
  await payload.init({
    config: config,
  })

  // clear all collections except users
  for (const collection of (await config).collections.filter((c) => c.slug !== 'users')) {
    await deleteCollection(collection.slug)
  }
})

afterAll(async () => {
  if (payload.db && typeof payload.db.destroy === 'function') {
    await payload.db.destroy()
  } else {
    console.log('Could not destroy database')
  }
})

describe('Multi-tenant baseFilter functionality', () => {
  let tenant1Id: string | number
  let tenant2Id: string | number

  beforeAll(async () => {
    // Create two tenants
    const tenant1 = await payload.create({
      collection: 'tenants',
      data: {
        slug: 'tenant-1',
        name: 'Tenant 1',
      },
    })
    tenant1Id = tenant1.id

    const tenant2 = await payload.create({
      collection: 'tenants',
      data: {
        slug: 'tenant-2',
        name: 'Tenant 2',
      },
    })
    tenant2Id = tenant2.id
  })

  describe('Pages isolation between tenants', () => {
    test('Root page creation respects tenant isolation', async () => {
      // Create root pages for both tenants
      const rootPage1 = await payload.create({
        collection: 'pages',
        data: {
          title: 'Tenant 1 Home',
          slug: '',
          content: 'Tenant 1 home content',
          isRootPage: true,
          // @ts-expect-error
          tenant: tenant1Id,
        },
      })

      const rootPage2 = await payload.create({
        collection: 'pages',
        data: {
          title: 'Tenant 2 Home',
          slug: '',
          content: 'Tenant 2 home content',
          isRootPage: true,
          // @ts-expect-error
          tenant: tenant2Id,
        },
      })

      // Verify both root pages were created with the same slug
      expect(rootPage1.slug).toBe('')
      expect(rootPage2.slug).toBe('')
      // @ts-expect-error
      expect(rootPage1.tenant?.id).toBe(tenant1Id)
      // @ts-expect-error
      expect(rootPage2.tenant?.id).toBe(tenant2Id)
    })

    test('Pages with same slug can exist in different tenants', async () => {
      // Create pages with the same slug for both tenants
      const page1 = await payload.create({
        collection: 'pages',
        data: {
          title: 'About Us - Tenant 1',
          slug: 'about',
          content: 'About tenant 1',
          // @ts-expect-error
          tenant: tenant1Id,
        },
      })

      const page2 = await payload.create({
        collection: 'pages',
        data: {
          title: 'About Us - Tenant 2',
          slug: 'about',
          content: 'About tenant 2',
          // @ts-expect-error
          tenant: tenant2Id,
        },
      })

      // Verify both pages were created with the same slug
      expect(page1.slug).toBe('about')
      expect(page2.slug).toBe('about')
      // @ts-expect-error
      expect(page1.tenant?.id).toBe(tenant1Id)
      // @ts-expect-error
      expect(page2.tenant?.id).toBe(tenant2Id)
    })

    test('Parent field respects tenant isolation', async () => {
      // Create parent pages for both tenants
      const parentPage1 = await payload.create({
        collection: 'pages',
        data: {
          title: 'Products - Tenant 1',
          slug: 'products',
          content: 'Products for tenant 1',
          // @ts-expect-error
          tenant: tenant1Id,
        },
      })

      const parentPage2 = await payload.create({
        collection: 'pages',
        data: {
          title: 'Products - Tenant 2',
          slug: 'products',
          content: 'Products for tenant 2',
          // @ts-expect-error
          tenant: tenant2Id,
        },
      })

      // Create child pages
      const childPage1 = await payload.create({
        collection: 'pages',
        data: {
          title: 'Product A',
          slug: 'product-a',
          content: 'Product A details',
          parent: parentPage1.id,
          // @ts-expect-error
          tenant: tenant1Id,
        },
      })

      const childPage2 = await payload.create({
        collection: 'pages',
        data: {
          title: 'Product B',
          slug: 'product-b',
          content: 'Product B details',
          parent: parentPage2.id,
          // @ts-expect-error
          tenant: tenant2Id,
        },
      })

      // Verify parent relationships
      // @ts-expect-error
      expect(childPage1.parent?.id).toBe(parentPage1.id)
      // @ts-expect-error
      expect(childPage2.parent?.id).toBe(parentPage2.id)
      // @ts-expect-error
      expect(childPage1.tenant?.id).toBe(tenant1Id)
      // @ts-expect-error
      expect(childPage2.tenant?.id).toBe(tenant2Id)
    })
  })

  describe('Breadcrumbs respect tenant isolation', () => {
    test('Breadcrumbs only include pages from the same tenant', async () => {
      // Setup: Create hierarchical pages for tenant 1
      const rootPageT1 = await payload.create({
        collection: 'pages',
        data: {
          title: 'Services',
          slug: 'services',
          content: 'Services page',
          // @ts-expect-error
          tenant: tenant1Id,
        },
      })

      const childPageT1 = await payload.create({
        collection: 'pages',
        data: {
          title: 'Consulting',
          slug: 'consulting',
          content: 'Consulting services',
          parent: rootPageT1.id,
          // @ts-expect-error
          tenant: tenant1Id,
        },
      })

      // Setup: Create similar hierarchy for tenant 2
      const rootPageT2 = await payload.create({
        collection: 'pages',
        data: {
          title: 'Services',
          slug: 'services',
          content: 'Services page T2',
          // @ts-expect-error
          tenant: tenant2Id,
        },
      })

      const childPageT2 = await payload.create({
        collection: 'pages',
        data: {
          title: 'Development',
          slug: 'development',
          content: 'Development services',
          parent: rootPageT2.id,
          // @ts-expect-error
          tenant: tenant2Id,
        },
      })

      // Fetch pages with breadcrumbs
      const fetchedChildT1 = await payload.findByID({
        collection: 'pages',
        id: childPageT1.id,
      })

      const fetchedChildT2 = await payload.findByID({
        collection: 'pages',
        id: childPageT2.id,
      })

      // Verify breadcrumbs are tenant-specific
      expect(fetchedChildT1.breadcrumbs).toHaveLength(2)
      expect(fetchedChildT1.breadcrumbs[0].label).toBe('Services')
      expect(fetchedChildT1.breadcrumbs[1].label).toBe('Consulting')

      expect(fetchedChildT2.breadcrumbs).toHaveLength(2)
      expect(fetchedChildT2.breadcrumbs[0].label).toBe('Services')
      expect(fetchedChildT2.breadcrumbs[1].label).toBe('Development')

      // Paths should be correctly generated
      expect(fetchedChildT1.path).toBe('/services/consulting')
      expect(fetchedChildT2.path).toBe('/services/development')
    })

    test('Cross-collection breadcrumbs respect tenant isolation', async () => {
      // Create author overview pages for both tenants
      const authorPageT1 = await payload.create({
        collection: 'pages',
        data: {
          title: 'Authors T1',
          slug: 'authors',
          content: 'Authors overview T1',
          // @ts-expect-error
          tenant: tenant1Id,
        },
      })

      const authorPageT2 = await payload.create({
        collection: 'pages',
        data: {
          title: 'Writers T2',
          slug: 'writers',
          content: 'Writers overview T2',
          // @ts-expect-error
          tenant: tenant2Id,
        },
      })

      // Create authors in different tenants
      const author1 = await payload.create({
        collection: 'authors',
        data: {
          name: 'Author One',
          slug: 'author-one',
          content: 'Bio of author one',
          parent: authorPageT1.id,
          // @ts-expect-error
          tenant: tenant1Id,
        },
      })

      const author2 = await payload.create({
        collection: 'authors',
        data: {
          name: 'Author Two',
          slug: 'author-two',
          content: 'Bio of author two',
          parent: authorPageT2.id,
          // @ts-expect-error
          tenant: tenant2Id,
        },
      })

      // Verify breadcrumbs respect tenant boundaries
      const fetchedAuthor1 = await payload.findByID({
        collection: 'authors',
        id: author1.id,
      })

      const fetchedAuthor2 = await payload.findByID({
        collection: 'authors',
        id: author2.id,
      })

      expect(fetchedAuthor1.breadcrumbs[0].label).toBe('Authors T1')
      expect(fetchedAuthor1.path).toBe('/authors/author-one')

      expect(fetchedAuthor2.breadcrumbs[0].label).toBe('Writers T2')
      expect(fetchedAuthor2.path).toBe('/writers/author-two')
    })
  })

  describe('Redirects validation respects tenant isolation', () => {
    test('Redirect validation only checks within the same tenant', async () => {
      // Create redirect for tenant 1
      const redirect1 = await payload.create({
        collection: 'redirects',
        data: {
          sourcePath: '/old-page',
          destinationPath: '/new-page',
          type: 'permanent',
          // @ts-expect-error
          tenant: tenant1Id,
        },
      })

      // Should be able to create the same redirect for tenant 2
      const redirect2 = await payload.create({
        collection: 'redirects',
        data: {
          sourcePath: '/old-page',
          destinationPath: '/new-page',
          type: 'permanent',
          // @ts-expect-error
          tenant: tenant2Id,
        },
      })

      expect(redirect1.sourcePath).toBe('/old-page')
      expect(redirect2.sourcePath).toBe('/old-page')
      // @ts-expect-error
      expect(redirect1.tenant?.id).toBe(tenant1Id)
      // @ts-expect-error
      expect(redirect2.tenant?.id).toBe(tenant2Id)
    })

    test('Redirect loop detection only checks within the same tenant', async () => {
      // Create bidirectional redirects in tenant 1 (should fail)

      // First create the 'forward' redirect
      await payload.create({
        collection: 'redirects',
        data: {
          sourcePath: '/page-a',
          destinationPath: '/page-b',
          type: 'permanent',
          // @ts-expect-error
          tenant: tenant1Id,
        },
      })

      // Then create the 'backward' redirect. This should fail for tenant 1
      await expect(
        payload.create({
          collection: 'redirects',
          data: {
            sourcePath: '/page-b',
            destinationPath: '/page-a',
            type: 'permanent',
            // @ts-expect-error
            tenant: tenant1Id,
          },
        }),
      ).rejects.toThrow()

      // But creating the same 'backward' redirect should work in tenant 2
      const backwardsRedirectTenant2 = await payload.create({
        collection: 'redirects',
        data: {
          sourcePath: '/page-b',
          destinationPath: '/page-a',
          type: 'permanent',
          // @ts-expect-error
          tenant: tenant2Id,
        },
      })

      expect(backwardsRedirectTenant2.sourcePath).toBe('/page-b')
      // @ts-expect-error
      expect(backwardsRedirectTenant2.tenant?.id).toBe(tenant2Id)
    })
  })
})

/**
 * Helper function to delete all documents from a collection.
 */
const deleteCollection = async (collection: CollectionSlug) => {
  // use db.deleteMany instead of payload.delete to avoid running hooks
  await payload.db.deleteMany({
    collection: collection,
    where: {},
  })
}
