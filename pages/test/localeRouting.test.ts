import { describe, expect, test } from 'vitest'

import type { LocaleRouting } from '../src/types/PagesPluginConfig.js'

import {
  localePathPrefix,
  localePrefixMap,
  localeRoutingCacheToken,
  resolveLocaleRouting,
  rootPathForLocale,
} from '../src/utils/localeRouting.js'

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
  test('serves the unprefixed primary locale`s root page at the site root', () => {
    expect(rootPathForLocale('de', { primaryLocale: 'de', prefixPrimaryLocale: false })).toBe('/')
    expect(rootPathForLocale('en', { primaryLocale: 'de', prefixPrimaryLocale: false })).toBe('/en')
    expect(rootPathForLocale('de', undefined)).toBe('/de')
    expect(rootPathForLocale(undefined, undefined)).toBe('/')
  })
})

describe('localePrefixMap', () => {
  test('maps every configured locale to the prefix its paths carry', () => {
    expect(
      localePrefixMap(['de', 'en'], { primaryLocale: 'de', prefixPrimaryLocale: false }),
    ).toEqual({ de: '', en: '/en' })
  })
})

describe('localeRoutingCacheToken', () => {
  test('distinguishes no routing, a prefixed primary locale and an unprefixed one', () => {
    const tokens = [
      localeRoutingCacheToken(undefined),
      localeRoutingCacheToken({ primaryLocale: 'de' }),
      localeRoutingCacheToken({ primaryLocale: 'de', prefixPrimaryLocale: false }),
      localeRoutingCacheToken({ primaryLocale: 'en' }),
    ]

    expect(new Set(tokens).size).toBe(tokens.length)
    expect(tokens.every((token) => token.length > 0)).toBe(true)
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

  test('throws when a function resolver is evaluated without a request', async () => {
    await expect(
      resolveLocaleRouting({
        payload: payloadWith(['de', 'en']),
        pluginConfig: { localeRouting: () => ({ primaryLocale: 'de' }) } as any,
        req: undefined,
      }),
    ).rejects.toThrow(/req/)
  })
})
