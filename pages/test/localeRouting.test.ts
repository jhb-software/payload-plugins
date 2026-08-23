import { describe, expect, test } from 'vitest'

import type { LocaleRouting } from '../src/types/PagesPluginConfig.js'

import { buildPathCacheKey } from '../src/queries/pathCache.js'
import {
  localePathPrefix,
  localePrefixMap,
  parseLocalizedPath,
  prefixForLocale,
  rootPathForLocale,
  rootPathFromPrefixes,
} from '../src/utils/localePrefix.js'
import { resolveLocaleRouting } from '../src/utils/resolveLocaleRouting.js'

const payloadWith = (localeCodes: string[] | undefined) =>
  ({
    config: { localization: localeCodes ? { defaultLocale: localeCodes[0], localeCodes } : false },
  }) as any

describe('localePathPrefix', () => {
  test('prefixes every locale when no routing is configured', () => {
    expect(localePathPrefix('de', undefined)).toBe('/de')
    expect(localePathPrefix('en', undefined)).toBe('/en')
  })

  test('prefixes the primary locale unless it is explicitly served unprefixed', () => {
    const prefixed: LocaleRouting = { primaryLocale: 'de' }
    const unprefixed: LocaleRouting = { primaryLocale: 'de', prefixPrimaryLocale: false }

    expect(localePathPrefix('de', prefixed)).toBe('/de')
    expect(localePathPrefix('de', unprefixed)).toBe('')
    expect(localePathPrefix('en', unprefixed)).toBe('/en')
  })

  test('yields no prefix on an unlocalized install', () => {
    expect(localePathPrefix(undefined, undefined)).toBe('')
  })
})

describe('rootPathForLocale', () => {
  test('serves the unprefixed primary locale’s root page at the site root', () => {
    expect(rootPathForLocale('de', { primaryLocale: 'de', prefixPrimaryLocale: false })).toBe('/')
  })

  test('serves every other root page under its locale prefix', () => {
    expect(rootPathForLocale('en', { primaryLocale: 'de', prefixPrimaryLocale: false })).toBe('/en')
    expect(rootPathForLocale('de', undefined)).toBe('/de')
  })

  test('serves the root page at the site root on an unlocalized install', () => {
    expect(rootPathForLocale(undefined, undefined)).toBe('/')
  })
})

describe('localePrefixMap', () => {
  test('maps every configured locale to the prefix its paths carry', () => {
    expect(
      localePrefixMap(['de', 'en'], { primaryLocale: 'de', prefixPrimaryLocale: false }),
    ).toEqual({ de: '', en: '/en' })
  })

  test('yields no map on an unlocalized install, where there is nothing to prefix', () => {
    expect(localePrefixMap(undefined, { primaryLocale: 'de' })).toBeUndefined()
  })
})

// The admin field components run without a `req` and cannot resolve a per-request routing, so
// they read the prefixes off the map their server component handed them.
describe('prefixForLocale', () => {
  const prefixes = { de: '', en: '/en' }

  test('reads the prefix of a mapped locale', () => {
    expect(prefixForLocale(prefixes, 'de')).toBe('')
    expect(prefixForLocale(prefixes, 'en')).toBe('/en')
  })

  test('falls back to the locale’s own prefix when the map does not cover it', () => {
    expect(prefixForLocale(prefixes, 'fr')).toBe('/fr')
    expect(prefixForLocale(undefined, 'fr')).toBe('/fr')
  })

  test('yields no prefix while the admin shows all locales at once', () => {
    expect(prefixForLocale(prefixes, 'all')).toBe('')
    expect(prefixForLocale(prefixes, undefined)).toBe('')
  })
})

describe('rootPathFromPrefixes', () => {
  test('serves the root page of an unprefixed locale at the site root', () => {
    expect(rootPathFromPrefixes({ de: '', en: '/en' }, 'de')).toBe('/')
  })

  test('serves the root page of a prefixed locale under its prefix', () => {
    expect(rootPathFromPrefixes({ de: '', en: '/en' }, 'en')).toBe('/en')
  })

  test('serves the root page at the site root while the admin shows all locales at once', () => {
    expect(rootPathFromPrefixes({ de: '', en: '/en' }, 'all')).toBe('/')
  })
})

describe('resolveLocaleRouting', () => {
  test('rejects a primary locale which is not a configured locale code', async () => {
    await expect(
      resolveLocaleRouting({
        payload: payloadWith(['de', 'en']),
        pluginConfig: { localeRouting: { primaryLocale: 'fr' } } as any,
        req: undefined,
      }),
    ).rejects.toThrow(/"fr"/)
  })

  test('ignores the option on an unlocalized install', async () => {
    await expect(
      resolveLocaleRouting({
        payload: payloadWith(undefined),
        pluginConfig: { localeRouting: { primaryLocale: 'fr' } } as any,
        req: undefined,
      }),
    ).resolves.toBeUndefined()
  })

  test('evaluates a function resolver once per request and reuses the cached result', async () => {
    let calls = 0
    const payload = payloadWith(['de', 'en'])
    const req = { context: {}, payload } as any
    const pluginConfig = {
      localeRouting: () => {
        calls++
        return { primaryLocale: 'de', prefixPrimaryLocale: false }
      },
    } as any

    const [first, second] = await Promise.all([
      resolveLocaleRouting({ payload, pluginConfig, req }),
      resolveLocaleRouting({ payload, pluginConfig, req }),
    ])
    const third = await resolveLocaleRouting({ payload, pluginConfig, req })

    expect(calls).toBe(1)
    expect(first).toEqual({ primaryLocale: 'de', prefixPrimaryLocale: false })
    expect(second).toEqual(first)
    expect(third).toEqual(first)
  })

  test('resolves separately for a second request', async () => {
    let calls = 0
    const payload = payloadWith(['de', 'en'])
    const pluginConfig = {
      localeRouting: () => {
        calls++
        return { primaryLocale: 'en' }
      },
    } as any

    await resolveLocaleRouting({ payload, pluginConfig, req: { context: {}, payload } as any })
    await resolveLocaleRouting({ payload, pluginConfig, req: { context: {}, payload } as any })

    expect(calls).toBe(2)
  })

  // The `req`-less case is covered end to end in dev_multi_tenant, where it surfaces out of
  // `findPageByPath`.
})

describe('parseLocalizedPath', () => {
  const parse = (path: string, routing: LocaleRouting | undefined, explicitLocale?: string) =>
    parseLocalizedPath({
      explicitLocale,
      localization: { defaultLocale: 'en', localeCodes: ['de', 'en'] },
      routing,
      segments: path.split('/').slice(1),
    })

  test('strips a locale prefix and infers the locale from it', () => {
    expect(parse('/de/kontakt', undefined)).toEqual({ locale: 'de', slugSegments: ['kontakt'] })
    expect(parse('/en/contact/us', undefined)).toEqual({
      locale: 'en',
      slugSegments: ['contact', 'us'],
    })
  })

  test('falls back to the default locale for an unprefixed path when no routing is configured', () => {
    expect(parse('/kontakt', undefined)).toEqual({ locale: 'en', slugSegments: ['kontakt'] })
  })

  test('infers the primary locale for an unprefixed path', () => {
    expect(parse('/kontakt', { primaryLocale: 'de', prefixPrimaryLocale: false })).toEqual({
      locale: 'de',
      slugSegments: ['kontakt'],
    })
    expect(parse('/', { primaryLocale: 'de', prefixPrimaryLocale: false })).toEqual({
      locale: 'de',
      slugSegments: [''],
    })
  })

  test('keeps a leading locale code as a slug when that locale is served unprefixed', () => {
    expect(parse('/de/kontakt', { primaryLocale: 'de', prefixPrimaryLocale: false })).toEqual({
      locale: 'de',
      slugSegments: ['de', 'kontakt'],
    })
  })

  test('still strips the prefix of a locale which is not the unprefixed primary one', () => {
    expect(parse('/en/contact', { primaryLocale: 'de', prefixPrimaryLocale: false })).toEqual({
      locale: 'en',
      slugSegments: ['contact'],
    })
  })

  test('lets an explicit locale argument win over the inferred one', () => {
    expect(parse('/kontakt', { primaryLocale: 'de', prefixPrimaryLocale: false }, 'en')).toEqual({
      locale: 'en',
      slugSegments: ['kontakt'],
    })
    expect(parse('/de/kontakt', undefined, 'en')).toEqual({
      locale: 'en',
      slugSegments: ['kontakt'],
    })
  })
})

describe('buildPathCacheKey', () => {
  const key = (routing: LocaleRouting | undefined) =>
    buildPathCacheKey({
      baseFilter: undefined,
      draft: false,
      locale: 'de',
      path: '/kontakt',
      routing,
      where: undefined,
    })

  test('gives the same path a different cache slot per routing', () => {
    const keys = [
      key(undefined),
      key({ primaryLocale: 'de' }),
      key({ primaryLocale: 'de', prefixPrimaryLocale: false }),
      key({ primaryLocale: 'en' }),
    ]

    expect(new Set(keys).size).toBe(keys.length)
  })

  test('stays on the v1 prefix so existing entries remain sweepable by clearPathCache', () => {
    expect(key(undefined).startsWith('payload-pages:path:v1:')).toBe(true)
  })
})
