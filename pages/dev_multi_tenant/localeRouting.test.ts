import { findPageByPath, listPagePaths } from '@jhb.software/payload-pages-plugin'
import payload, { createLocalReq, type CollectionSlug, type PayloadRequest } from 'payload'
import type { Config } from 'payload/generated-types'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import config from './src/payload.config'
import {
  clearCapturedAfterChanges,
  getLastAfterChangeHookArgs,
} from './src/test/afterChangeCapture'
import { clearLocaleRoutingCalls, localeRoutingCalls } from './src/test/localeRoutingCalls'
import { RESOLVER_READS_PAGES_HEADER } from './src/test/resolverReadsPages'
import {
  clearPathChangeRecords,
  recordedPathChangeErrors,
  recordedPathChanges,
} from './src/test/pathChangesCapture'

type DefaultIDType = Config['db']['defaultIDType']

/** Empty virtual fields the plugin generates, spread in to satisfy TypeScript. */
const virtualFields = { breadcrumbs: [], meta: { alternatePaths: [] }, path: '' }

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
let prefixedContact: DefaultIDType

/**
 * Every test file in this app runs against the one database `PAYLOAD_DATABASE` points at and
 * starts by emptying it, so the files must not overlap — `vite.config.ts` sets
 * `fileParallelism: false` for that reason.
 */
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

  await createPage({
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
  test('generates the unprefixed primary locale’s paths without a locale segment', async () => {
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

  test('does not resolve the primary locale’s prefixed path when that locale is served unprefixed', async () => {
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

  test('evaluates the routing resolver once per request, not once per document', async () => {
    const tenant = await createTenant({
      name: 'Bulk',
      prefixAllLocales: false,
      primaryLocale: 'de',
      slug: 'routing-bulk',
    })

    // A per-document evaluation would report one call per page; a handful is enough to tell the
    // two apart.
    const pageCount = 8

    for (let index = 0; index < pageCount; index++) {
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

    expect(docs.length).toBeGreaterThanOrEqual(pageCount)
    expect(localeRoutingCalls()).toBe(1)
  })

  test('appends the primary locale’s path as x-default only when routing resolves', async () => {
    /** The `alternatePaths` rows without the ids Payload assigns to array items. */
    const alternatePathsOf = async (req: PayloadRequest) => {
      const doc = await payload.findByID({ collection: 'pages', id: unprefixedContact, req })

      return (doc.meta?.alternatePaths ?? []).map(({ hreflang, path }) => ({ hreflang, path }))
    }

    expect(await alternatePathsOf(await tenantReq(unprefixedTenant))).toEqual([
      { hreflang: 'de', path: '/kontakt' },
      { hreflang: 'en', path: '/en/contact' },
      { hreflang: 'x-default', path: '/kontakt' },
    ])

    // No tenant cookie means the resolver returns undefined, so there is no primary locale.
    expect(await alternatePathsOf(await createLocalReq({}, payload))).toEqual([
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

  // The resolver's first evaluation on a request can happen inside a write's `afterChange`, and a
  // resolver which reads a page collection runs a nested operation there. That operation must not
  // decide the draft mode of the write it is nested in.
  test('resolves the draft ancestors of a draft save whose routing resolver reads a page collection', async () => {
    const parent = await createPage({
      de: { slug: 'eltern', title: 'Eltern' },
      en: { slug: 'parent', title: 'Parent' },
      tenant: unprefixedTenant,
    })
    const child = await createPage({
      de: { slug: 'kind', title: 'Kind' },
      en: { slug: 'child', title: 'Child' },
      parent,
      tenant: unprefixedTenant,
    })

    // rename the parent in a draft: the child's draft path moves, its live path does not
    await payload.update({
      collection: 'pages',
      id: parent,
      locale: 'de',
      draft: true,
      data: { slug: 'eltern-entwurf', _status: 'draft' },
    })

    const req = await createLocalReq({}, payload)
    req.headers = new Headers({
      cookie: `payload-tenant=${unprefixedTenant}`,
      [RESOLVER_READS_PAGES_HEADER]: 'true',
    })

    const saved = await payload.update({
      collection: 'pages',
      id: child,
      locale: 'de',
      draft: true,
      data: { title: 'Kind bearbeitet', _status: 'draft' },
      req,
    })

    expect(saved.path).toBe('/eltern-entwurf/kind')
  })

  test('throws when resolving a path without a req while a routing function is configured', async () => {
    await expect(findPageByPath({ path: '/kontakt', payload })).rejects.toThrow(/localeRouting/)
  })
})

describe('per-locale liveness with a localized _status', () => {
  let halfPublished: DefaultIDType
  let halfPublishedRoot: DefaultIDType
  let halfPublishedRootTenant: DefaultIDType
  let unpublished: DefaultIDType
  /** Published in `en`, never written in `de`. */
  let englishOnly: DefaultIDType

  beforeAll(async () => {
    englishOnly = (
      await payload.create({
        collection: 'pages',
        locale: 'en',
        data: {
          ...virtualFields,
          content: 'English only',
          slug: 'english-only',
          tenant: prefixedTenant,
          title: 'English only',
          _status: 'published',
        },
      })
    ).id

    halfPublished = await createPage({
      de: { slug: 'entwurf', title: 'Entwurf' },
      en: { slug: 'published-en', title: 'Published' },
      publish: ['en'],
      tenant: prefixedTenant,
    })

    halfPublishedRootTenant = await createTenant({
      name: 'Draft German Root',
      prefixAllLocales: true,
      primaryLocale: 'en',
      slug: 'draft-german-root',
    })
    halfPublishedRoot = await createPage({
      de: { slug: '', title: 'Entwurf Startseite' },
      en: { slug: '', title: 'Published Home' },
      isRootPage: true,
      publish: ['en'],
      tenant: halfPublishedRootTenant,
    })

    unpublished = await createPage({
      de: { slug: 'nur-entwurf', title: 'Nur Entwurf' },
      en: { slug: 'draft-only', title: 'Draft only' },
      publish: [],
      tenant: prefixedTenant,
    })
  })

  test('enumerates only the locales which are published', async () => {
    const entries = await listPagePaths({ req: await tenantReq(prefixedTenant) })
    const own = entries.filter((entry) => entry.id === halfPublished)

    expect(own.map((entry) => `${entry.locale}:${entry.path}`)).toEqual(['en:/en/published-en'])
  })

  test('enumerates a locale-narrowed listing by that locale’s own published status', async () => {
    const english = await listPagePaths({ locale: 'en', req: await tenantReq(prefixedTenant) })
    expect(
      english.filter((entry) => entry.id === halfPublished).map((entry) => entry.path),
    ).toEqual(['/en/published-en'])

    const german = await listPagePaths({ locale: 'de', req: await tenantReq(prefixedTenant) })
    expect(german.some((entry) => entry.id === halfPublished)).toBe(false)
  })

  test('resolves the published locale’s path and not the draft locale’s', async () => {
    const req = await tenantReq(prefixedTenant)

    expect((await findPageByPath({ path: '/en/published-en', req }))?.doc.id).toBe(halfPublished)
    expect(
      await findPageByPath({ path: '/de/entwurf', req: await tenantReq(prefixedTenant) }),
    ).toBeNull()
  })

  test('omits draft-only locales from published virtual paths and alternates', async () => {
    const live = await payload.findByID({
      collection: 'pages',
      id: halfPublished,
      locale: 'all',
      req: await tenantReq(prefixedTenant),
    })

    expect(live.path).toEqual({ en: '/en/published-en' })
    expect(live.meta?.alternatePaths?.map(({ hreflang, path }) => ({ hreflang, path }))).toEqual([
      { hreflang: 'en', path: '/en/published-en' },
      { hreflang: 'x-default', path: '/en/published-en' },
    ])

    const preview = await payload.findByID({
      collection: 'pages',
      draft: true,
      id: halfPublished,
      locale: 'all',
      req: await tenantReq(prefixedTenant),
    })

    expect(preview.path).toEqual({ de: '/de/entwurf', en: '/en/published-en' })

    const saved = await payload.update({
      collection: 'pages',
      id: halfPublished,
      locale: 'en',
      data: { content: 'Published English edit', _status: 'published' },
      req: await tenantReq(prefixedTenant),
    })

    expect(saved.path).toBe('/en/published-en')
    expect(saved.meta?.alternatePaths?.map(({ hreflang, path }) => ({ hreflang, path }))).toEqual([
      { hreflang: 'en', path: '/en/published-en' },
      { hreflang: 'x-default', path: '/en/published-en' },
    ])
  })

  test('strips the status it selected on its own behalf from a read which did not ask for it', async () => {
    const narrowLive = await payload.findByID({
      collection: 'pages',
      id: halfPublished,
      locale: 'all',
      req: await tenantReq(prefixedTenant),
      select: { path: true },
    })

    expect(narrowLive.path).toEqual({ en: '/en/published-en' })
    expect(narrowLive).not.toHaveProperty('_status')
  })

  test('drops the written locale from the write response of an unpublish, and keeps it on previousDoc', async () => {
    const page = await createPage({
      de: { slug: 'wird-entzogen', title: 'Wird entzogen' },
      en: { slug: 'gets-unpublished', title: 'Gets unpublished' },
      tenant: prefixedTenant,
    })
    clearCapturedAfterChanges()

    // What the admin's Unpublish button sends: a status write without a `draft` flag.
    const saved = await payload.update({
      collection: 'pages',
      id: page,
      locale: 'de',
      data: { _status: 'draft' },
      req: await tenantReq(prefixedTenant),
    })

    expect(saved.path).toBeUndefined()
    expect(saved.breadcrumbs).toBeUndefined()
    // A write response only knows the written locale, and that one just stopped being live.
    expect(saved.meta?.alternatePaths).toEqual([])

    const { previousDoc } = getLastAfterChangeHookArgs()
    expect(previousDoc.path).toBe('/de/wird-entzogen')

    const read = await payload.findByID({
      collection: 'pages',
      id: page,
      locale: 'all',
      req: await tenantReq(prefixedTenant),
    })
    expect(read.path).toEqual({ en: '/en/gets-unpublished' })
  })

  test('drops the written locale from the write response of a root page unpublish', async () => {
    const tenant = await createTenant({
      name: 'Unpublished Root',
      prefixAllLocales: true,
      primaryLocale: 'en',
      slug: 'unpublished-root',
    })
    const root = await createPage({
      de: { slug: '', title: 'Startseite' },
      en: { slug: '', title: 'Home' },
      isRootPage: true,
      tenant,
    })

    const saved = await payload.update({
      collection: 'pages',
      id: root,
      locale: 'de',
      data: { _status: 'draft' },
      req: await tenantReq(tenant),
    })

    expect(saved.path).toBeUndefined()
    expect(saved.breadcrumbs).toBeUndefined()
    expect(saved.meta?.alternatePaths).toEqual([])
  })

  test('omits draft-only locales from published root paths, breadcrumbs and alternates', async () => {
    const live = await payload.findByID({
      collection: 'pages',
      id: halfPublishedRoot,
      locale: 'all',
      req: await tenantReq(halfPublishedRootTenant),
    })

    expect(live.path).toEqual({ en: '/en' })
    expect(live.breadcrumbs).not.toHaveProperty('de')
    // @ts-expect-error - Payload does not type find operations with locale='all' correctly yet.
    expect(live.breadcrumbs.en.map(({ path }) => path)).toEqual(['/en'])
    expect(live.meta?.alternatePaths?.map(({ hreflang, path }) => ({ hreflang, path }))).toEqual([
      { hreflang: 'en', path: '/en' },
      { hreflang: 'x-default', path: '/en' },
    ])

    const preview = await payload.findByID({
      collection: 'pages',
      draft: true,
      id: halfPublishedRoot,
      locale: 'all',
      req: await tenantReq(halfPublishedRootTenant),
    })

    expect(preview.path).toEqual({ de: '/de', en: '/en' })

    const saved = await payload.update({
      collection: 'pages',
      id: halfPublishedRoot,
      locale: 'en',
      data: { content: 'Published home edit', _status: 'published' },
      req: await tenantReq(halfPublishedRootTenant),
    })

    expect(saved.path).toBe('/en')
    expect(saved.meta?.alternatePaths?.map(({ hreflang, path }) => ({ hreflang, path }))).toEqual([
      { hreflang: 'en', path: '/en' },
      { hreflang: 'x-default', path: '/en' },
    ])
  })

  test('falls back to the published locale’s path on a single-locale read of the draft-only locale', async () => {
    // `path` is a localized field, so a locale without a path is handled the way Payload handles
    // any other empty localized value: the request's fallback locale fills it in.
    const german = await payload.findByID({
      collection: 'pages',
      id: halfPublished,
      locale: 'de',
      req: await tenantReq(prefixedTenant),
    })

    expect(german.path).toBe('/en/published-en')
    expect(german.meta?.alternatePaths?.map(({ hreflang, path }) => ({ hreflang, path }))).toEqual([
      { hreflang: 'en', path: '/en/published-en' },
      { hreflang: 'x-default', path: '/en/published-en' },
    ])
  })

  test('leaves the path absent when the request disables the locale fallback', async () => {
    const strict = await payload.findByID({
      collection: 'pages',
      fallbackLocale: 'none',
      id: halfPublished,
      locale: 'de',
      req: await tenantReq(prefixedTenant),
    })

    expect(strict.path).toBeUndefined()
    expect(strict.meta?.alternatePaths?.map(({ hreflang, path }) => ({ hreflang, path }))).toEqual([
      { hreflang: 'en', path: '/en/published-en' },
      { hreflang: 'x-default', path: '/en/published-en' },
    ])
  })

  test('yields the draft locale’s own path on a single-locale draft read', async () => {
    const preview = await payload.findByID({
      collection: 'pages',
      draft: true,
      id: halfPublished,
      locale: 'de',
      req: await tenantReq(prefixedTenant),
    })

    expect(preview.path).toBe('/de/entwurf')
  })

  test('falls back to another locale’s path and breadcrumbs for a page never written in the requested locale', async () => {
    const german = await payload.findByID({
      collection: 'pages',
      id: englishOnly,
      locale: 'de',
      req: await tenantReq(prefixedTenant),
    })

    // The whole document falls back, so an English path is the consistent answer.
    expect(german.title).toBe('English only')
    expect(german.path).toBe('/en/english-only')
    expect(german.breadcrumbs.map(({ path }) => path)).toEqual(['/en/english-only'])
    expect(german.meta?.alternatePaths?.map(({ hreflang, path }) => ({ hreflang, path }))).toEqual([
      { hreflang: 'en', path: '/en/english-only' },
      { hreflang: 'x-default', path: '/en/english-only' },
    ])

    const all = await payload.findByID({
      collection: 'pages',
      id: englishOnly,
      locale: 'all',
      req: await tenantReq(prefixedTenant),
    })

    expect(all.path).toEqual({ en: '/en/english-only' })
    // @ts-expect-error - Payload does not type find operations with locale='all' correctly yet.
    expect(all.breadcrumbs.en.map(({ path }) => path)).toEqual(['/en/english-only'])
    expect(all.breadcrumbs).not.toHaveProperty('de')
  })

  test('leaves the path absent on a default-locale read of a page never written in that locale', async () => {
    // Payload never falls back when the default locale itself is requested, so `en` gets no path
    // here. `alternatePaths` still names the live locale; `x-default` is missing because the
    // primary locale `en` is not live.
    const germanOnly = await payload.create({
      collection: 'pages',
      locale: 'de',
      data: {
        ...virtualFields,
        content: 'Nur Deutsch',
        slug: 'nur-deutsch',
        tenant: prefixedTenant,
        title: 'Nur Deutsch',
        _status: 'published',
      },
    })

    const english = await payload.findByID({
      collection: 'pages',
      id: germanOnly.id,
      locale: 'en',
      req: await tenantReq(prefixedTenant),
    })

    expect(english.path).toBeUndefined()
    expect(english.meta?.alternatePaths?.map(({ hreflang, path }) => ({ hreflang, path }))).toEqual(
      [{ hreflang: 'de', path: '/de/nur-deutsch' }],
    )
  })

  test('populates a linked page’s fallback path and its live alternates in the requesting locale', async () => {
    const linking = await createPage({
      de: { slug: 'verweist', title: 'Verweist' },
      en: { slug: 'links-to', title: 'Links to' },
      tenant: prefixedTenant,
    })
    await payload.update({
      collection: 'pages',
      id: linking,
      locale: 'de',
      data: { relatedPage: englishOnly, _status: 'published' },
    })

    const german = await payload.findByID({
      collection: 'pages',
      depth: 1,
      id: linking,
      locale: 'de',
      req: await tenantReq(prefixedTenant),
    })

    const target = german.relatedPage as Extract<typeof german.relatedPage, { id: unknown }>
    expect(target.path).toBe('/en/english-only')
    expect(target.meta?.alternatePaths?.map(({ hreflang }) => hreflang)).toEqual([
      'en',
      'x-default',
    ])
  })

  test('yields no path at all for a document published in no locale', async () => {
    const live = await payload.findByID({
      collection: 'pages',
      id: unpublished,
      locale: 'all',
      req: await tenantReq(prefixedTenant),
    })

    expect(live.path).toEqual({})
    expect(live.meta?.alternatePaths).toEqual([])

    // There is no locale to fall back to.
    const german = await payload.findByID({
      collection: 'pages',
      id: unpublished,
      locale: 'de',
      req: await tenantReq(prefixedTenant),
    })

    expect(german.path).toBeUndefined()
    expect(german.meta?.alternatePaths).toEqual([])

    const preview = await payload.findByID({
      collection: 'pages',
      draft: true,
      id: unpublished,
      locale: 'all',
      req: await tenantReq(prefixedTenant),
    })

    expect(preview.path).toEqual({ de: '/de/nur-entwurf', en: '/en/draft-only' })
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

  test('reports the draft locale’s path as new once that locale is published', async () => {
    clearPathChangeRecords()

    await payload.update({
      collection: 'pages',
      id: halfPublished,
      locale: 'de',
      data: { _status: 'published' },
    })

    expect(recordedPathChangeErrors()).toEqual([])
    expect(recordedPathChanges()).toEqual([
      {
        id: halfPublished,
        collection: 'pages',
        locale: 'de',
        path: '/de/entwurf',
        previousPath: null,
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

    const messages: string[] = error.data.errors.map((entry: { message: string }) => entry.message)

    expect(messages).toHaveLength(1)
    // Asserted by shape rather than verbatim, so rewording the translation stays a translation
    // change: the reason names the offending slug and says why it cannot be used.
    expect(messages[0]).toMatch(/"de"/)
    expect(messages[0]).toMatch(/locale code/)
  })

  test('accepts a slug which merely starts with a locale code', async () => {
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
