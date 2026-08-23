import { findPageByPath, listPagePaths } from '@jhb.software/payload-pages-plugin'
import payload, { createLocalReq, type CollectionSlug } from 'payload'
import type { Config } from 'payload/generated-types'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import config from './src/payload.config'
import { clearLocaleRoutingCalls, localeRoutingCalls } from './src/test/localeRoutingCalls'
import { RESOLVER_READS_PAGES_HEADER } from './src/test/resolverReadsPages'
import {
  clearPathChangeRecords,
  recordedPathChangeErrors,
  recordedPathChanges,
} from './src/test/pathChangesCapture'

type DefaultIDType = Config['db']['defaultIDType']

/** Empty virtual fields the plugin generates, spread in to satisfy TypeScript. */
const virtualFields = { breadcrumbs: [], path: '' }

/** Builds a request whose cookie selects the given tenant, as the plugin's resolvers read it. */
const tenantReq = async (tenantId: DefaultIDType) => {
  const req = await createLocalReq({}, payload)
  req.headers = new Headers({ cookie: `payload-tenant=${tenantId}` })
  return req
}

const createTenant = async (data: {
  name: string
  prefixAllLocales: boolean
  primaryLocale: 'de' | 'en'
  slug: string
}) =>
  (
    await payload.create({
      collection: 'tenants',
      data: { ...data, websiteUrl: `https://${data.slug}.example.com` },
    })
  ).id

/**
 * Creates a page which is published in both locales. `_status` is localized on this collection,
 * so each locale is published by its own write.
 */
const createPage = async (args: {
  de: { slug: string; title: string }
  en: { slug: string; title: string }
  isRootPage?: boolean
  parent?: DefaultIDType
  publish?: ('de' | 'en')[]
  tenant: DefaultIDType
}) => {
  const publish = args.publish ?? ['de', 'en']

  const created = await payload.create({
    collection: 'pages',
    locale: 'de',
    data: {
      ...virtualFields,
      content: args.de.title,
      isRootPage: args.isRootPage,
      parent: args.parent,
      slug: args.de.slug,
      tenant: args.tenant,
      title: args.de.title,
      _status: publish.includes('de') ? 'published' : 'draft',
    },
  })

  await payload.update({
    collection: 'pages',
    id: created.id,
    locale: 'en',
    data: {
      content: args.en.title,
      slug: args.en.slug,
      title: args.en.title,
      _status: publish.includes('en') ? 'published' : 'draft',
    },
  })

  return created.id
}

let unprefixedTenant: DefaultIDType
let prefixedTenant: DefaultIDType

/** `de` primary and unprefixed. */
let unprefixedRoot: DefaultIDType
let unprefixedContact: DefaultIDType
/** every locale prefixed, `en` primary. */
let prefixedRoot: DefaultIDType
let prefixedContact: DefaultIDType

beforeAll(async () => {
  await payload.init({ config })
  await deleteAllCollections(['users'])

  unprefixedTenant = await createTenant({
    name: 'Unprefixed German',
    prefixAllLocales: false,
    primaryLocale: 'de',
    slug: 'routing-unprefixed',
  })
  prefixedTenant = await createTenant({
    name: 'All Prefixed',
    prefixAllLocales: true,
    primaryLocale: 'en',
    slug: 'routing-prefixed',
  })

  unprefixedRoot = await createPage({
    de: { slug: '', title: 'Startseite' },
    en: { slug: '', title: 'Home' },
    isRootPage: true,
    tenant: unprefixedTenant,
  })
  unprefixedContact = await createPage({
    de: { slug: 'kontakt', title: 'Kontakt' },
    en: { slug: 'contact', title: 'Contact' },
    tenant: unprefixedTenant,
  })

  prefixedRoot = await createPage({
    de: { slug: '', title: 'Startseite' },
    en: { slug: '', title: 'Home' },
    isRootPage: true,
    tenant: prefixedTenant,
  })
  prefixedContact = await createPage({
    de: { slug: 'kontakt', title: 'Kontakt' },
    en: { slug: 'contact', title: 'Contact' },
    tenant: prefixedTenant,
  })
})

afterAll(async () => {
  if (payload.db && typeof payload.db.destroy === 'function') {
    await payload.db.destroy()
  }
})

describe('locale routing', () => {
  test('generates the unprefixed primary locale`s paths without a locale segment', async () => {
    const req = await tenantReq(unprefixedTenant)
    const paths = await listPagePaths({ req })

    expect(new Set(paths.map((entry) => `${entry.locale}:${entry.path}`))).toEqual(
      new Set(['de:/', 'en:/en', 'de:/kontakt', 'en:/en/contact']),
    )
  })

  test('keeps every locale prefixed for a tenant which asks for it', async () => {
    const req = await tenantReq(prefixedTenant)
    const paths = await listPagePaths({ req })

    expect(new Set(paths.map((entry) => `${entry.locale}:${entry.path}`))).toEqual(
      new Set(['de:/de', 'en:/en', 'de:/de/kontakt', 'en:/en/contact']),
    )
  })

  test('resolves every enumerated path back to the document it was generated for', async () => {
    for (const tenant of [unprefixedTenant, prefixedTenant]) {
      const entries = await listPagePaths({ req: await tenantReq(tenant) })
      expect(entries.length).toBeGreaterThan(0)

      for (const entry of entries) {
        const resolved = await findPageByPath({
          path: entry.path,
          req: await tenantReq(tenant),
        })

        expect(
          { id: resolved?.doc.id, path: entry.path },
          `resolving ${entry.path} for tenant ${String(tenant)}`,
        ).toEqual({ id: entry.id, path: entry.path })
      }
    }
  })

  test('resolves an unprefixed path in the primary locale and a prefixed one in its own locale', async () => {
    const req = async () => await tenantReq(unprefixedTenant)

    expect((await findPageByPath({ path: '/kontakt', req: await req() }))?.doc.id).toBe(
      unprefixedContact,
    )
    expect((await findPageByPath({ path: '/en/contact', req: await req() }))?.doc.id).toBe(
      unprefixedContact,
    )
    expect((await findPageByPath({ path: '/', req: await req() }))?.doc.id).toBe(unprefixedRoot)
  })

  test('does not resolve the primary locale`s prefixed path when that locale is served unprefixed', async () => {
    expect(
      await findPageByPath({ path: '/de/kontakt', req: await tenantReq(unprefixedTenant) }),
    ).toBeNull()
  })

  test('lets an explicit locale argument win over the locale inferred from an unprefixed path', async () => {
    const result = await findPageByPath({
      locale: 'en',
      path: '/kontakt',
      req: await tenantReq(unprefixedTenant),
    })

    // `/kontakt` is the German path, so asking for English finds nothing rather than silently
    // returning the German document under an English lookup.
    expect(result).toBeNull()

    const german = await findPageByPath({
      locale: 'de',
      path: '/kontakt',
      req: await tenantReq(unprefixedTenant),
    })
    expect(german?.doc.id).toBe(unprefixedContact)
  })

  test('resolves the same slug to different paths depending on the requesting tenant', async () => {
    expect(
      (await findPageByPath({ path: '/kontakt', req: await tenantReq(unprefixedTenant) }))?.doc.id,
    ).toBe(unprefixedContact)
    expect(
      (await findPageByPath({ path: '/de/kontakt', req: await tenantReq(prefixedTenant) }))?.doc.id,
    ).toBe(prefixedContact)

    // ...and never across the tenant boundary
    expect(
      await findPageByPath({ path: '/kontakt', req: await tenantReq(prefixedTenant) }),
    ).toBeNull()
    expect(
      await findPageByPath({ path: '/de/kontakt', req: await tenantReq(unprefixedTenant) }),
    ).toBeNull()
  })

  test(
    'evaluates the routing resolver once per request, not once per document',
    { timeout: 180_000 },
    async () => {
      const tenant = await createTenant({
        name: 'Bulk',
        prefixAllLocales: false,
        primaryLocale: 'de',
        slug: 'routing-bulk',
      })

      for (let index = 0; index < 50; index++) {
        await payload.create({
          collection: 'pages',
          locale: 'de',
          data: {
            ...virtualFields,
            content: `Bulk ${index}`,
            slug: `bulk-de-${index}`,
            tenant,
            title: `Bulk ${index}`,
            _status: 'published',
          },
        })
      }

      const req = await tenantReq(tenant)
      clearLocaleRoutingCalls()

      const { docs } = await payload.find({ collection: 'pages', limit: 0, pagination: false, req })

      expect(docs.length).toBeGreaterThanOrEqual(50)
      expect(localeRoutingCalls()).toBe(1)
    },
  )

  test('appends the primary locale`s path as x-default only when routing resolves', async () => {
    const withRouting = await payload.findByID({
      collection: 'pages',
      id: unprefixedContact,
      req: await tenantReq(unprefixedTenant),
    })

    expect(withRouting.meta?.alternatePaths).toEqual([
      { hreflang: 'de', path: '/kontakt' },
      { hreflang: 'en', path: '/en/contact' },
      { hreflang: 'x-default', path: '/kontakt' },
    ])

    // No tenant cookie means the resolver returns undefined, so there is no primary locale.
    const withoutRouting = await payload.findByID({
      collection: 'pages',
      id: unprefixedContact,
      req: await createLocalReq({}, payload),
    })

    expect(withoutRouting.meta?.alternatePaths).toEqual([
      { hreflang: 'de', path: '/de/kontakt' },
      { hreflang: 'en', path: '/en/contact' },
    ])
  })

  // Without re-entrancy handling the resolver waits for the paths of the pages it reads, which
  // wait for the routing it is resolving — the call never returns and this test times out.
  test('completes a routing resolver which reads a page collection with the same request', async () => {
    const req = await tenantReq(unprefixedTenant)
    req.headers = new Headers({
      cookie: `payload-tenant=${unprefixedTenant}`,
      [RESOLVER_READS_PAGES_HEADER]: 'true',
    })

    const paths = await listPagePaths({ req })

    expect(new Set(paths.map((entry) => `${entry.locale}:${entry.path}`))).toEqual(
      new Set(['de:/', 'en:/en', 'de:/kontakt', 'en:/en/contact']),
    )
  })

  test('throws when resolving a path without a req while a routing function is configured', async () => {
    await expect(findPageByPath({ path: '/kontakt', payload })).rejects.toThrow(/localeRouting/)
  })
})

describe('per-locale liveness with a localized _status', () => {
  let halfPublished: DefaultIDType

  beforeAll(async () => {
    halfPublished = await createPage({
      de: { slug: 'entwurf', title: 'Entwurf' },
      en: { slug: 'published-en', title: 'Published' },
      publish: ['en'],
      tenant: prefixedTenant,
    })
  })

  test('enumerates only the locales which are published', async () => {
    const entries = await listPagePaths({ req: await tenantReq(prefixedTenant) })
    const own = entries.filter((entry) => entry.id === halfPublished)

    expect(own.map((entry) => `${entry.locale}:${entry.path}`)).toEqual(['en:/en/published-en'])
  })

  test('enumerates a locale-narrowed listing by that locale`s own published status', async () => {
    const english = await listPagePaths({ locale: 'en', req: await tenantReq(prefixedTenant) })
    expect(
      english.filter((entry) => entry.id === halfPublished).map((entry) => entry.path),
    ).toEqual(['/en/published-en'])

    const german = await listPagePaths({ locale: 'de', req: await tenantReq(prefixedTenant) })
    expect(german.some((entry) => entry.id === halfPublished)).toBe(false)
  })

  test('resolves the published locale`s path and not the draft locale`s', async () => {
    const req = await tenantReq(prefixedTenant)

    expect((await findPageByPath({ path: '/en/published-en', req }))?.doc.id).toBe(halfPublished)
    expect(
      await findPageByPath({ path: '/de/entwurf', req: await tenantReq(prefixedTenant) }),
    ).toBeNull()
  })

  test('reports a path change only for the locale which is published', async () => {
    clearPathChangeRecords()

    await payload.update({
      collection: 'pages',
      id: halfPublished,
      locale: 'en',
      data: { slug: 'published-en-renamed', _status: 'published' },
    })

    expect(recordedPathChangeErrors()).toEqual([])
    expect(recordedPathChanges()).toEqual([
      {
        id: halfPublished,
        collection: 'pages',
        locale: 'en',
        path: '/en/published-en-renamed',
        previousPath: '/en/published-en',
      },
    ])
  })
})

describe('reserved slugs', () => {
  test('rejects a slug which is a configured locale code, with a translated reason', async () => {
    const error = await payload
      .create({
        collection: 'pages',
        locale: 'de',
        data: {
          ...virtualFields,
          content: 'Locale slug',
          slug: 'de',
          tenant: prefixedTenant,
          title: 'Locale slug',
        },
      })
      .then(
        () => null,
        (caught: any) => caught,
      )

    expect(error).not.toBeNull()
    expect(error.data.errors.map((entry: { message: string }) => entry.message)).toEqual([
      'The slug "de" is reserved: it is a locale code, which paths use as the locale prefix.',
    ])
  })

  test('accepts a slug which is not a locale code', async () => {
    const page = await payload.create({
      collection: 'pages',
      locale: 'de',
      data: {
        ...virtualFields,
        content: 'Fine',
        slug: 'deutschland',
        tenant: prefixedTenant,
        title: 'Fine',
      },
    })

    expect(page.slug).toBe('deutschland')
  })
})

/** Helper function to delete all documents from a collection. */
const deleteCollection = async (collection: CollectionSlug) => {
  await payload.db.deleteMany({ collection, where: {} })

  try {
    await payload.db.deleteVersions({ collection, where: {} })
  } catch {}
}

const COLLECTION_DELETION_ORDER: CollectionSlug[] = [
  'country-travel-tips',
  'blogposts',
  'authors',
  'countries',
  'redirects',
  'pages',
  'blogpost-categories',
  'tenants',
]

const deleteAllCollections = async (except: CollectionSlug[] = []) => {
  const collections = (await config).collections?.filter((c) => !except.includes(c.slug)) ?? []
  const collectionSlugs = new Set(collections.map((c) => c.slug))

  for (const slug of COLLECTION_DELETION_ORDER) {
    if (collectionSlugs.has(slug)) {
      await deleteCollection(slug)
      collectionSlugs.delete(slug)
    }
  }

  for (const slug of Array.from(collectionSlugs)) {
    await deleteCollection(slug)
  }
}
