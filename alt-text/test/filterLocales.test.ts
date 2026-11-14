import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import type { AltTextPluginConfig } from '../src/types/AltTextPluginConfig.ts'
import type { AltTextResolver } from '../src/resolvers/types.ts'

import { bulkGenerateAltTextsEndpoint } from '../src/endpoints/bulkGenerateAltTexts.ts'
import { generateAltTextEndpoint } from '../src/endpoints/generateAltText.ts'
import { buildEndpointRequest, buildPluginConfig } from './support/endpointHarness.ts'

/**
 * `filterLocales` narrows the locales one request generates for. A multi-tenant
 * project configures the union of every tenant's, so generating for all of it
 * writes locales the tenant does not serve and pays for each.
 */

type BulkCall = { locales: string[] }

function buildConfig(
  filterLocales: AltTextPluginConfig['filterLocales'],
  bulkCalls: BulkCall[] = [],
  resolveCalls: string[] = [],
): AltTextPluginConfig {
  const resolveBulk: AltTextResolver['resolveBulk'] = async ({ locales }) => {
    bulkCalls.push({ locales: [...locales] })

    return {
      success: true,
      results: Object.fromEntries(
        locales.map((locale) => [locale, { altText: `alt ${locale}`, keywords: [locale] }]),
      ),
    }
  }

  const resolve: AltTextResolver['resolve'] = async ({ locale }) => {
    resolveCalls.push(locale)

    return { success: true, result: { altText: 'generated alt', keywords: ['a'] } }
  }

  return buildPluginConfig({
    filterLocales,
    // localization enabled with the union of every tenant's locales
    locales: ['en', 'de'],
    resolver: { key: 'mock', resolve, resolveBulk },
  })
}

describe('filterLocales (bulk generation)', () => {
  test('generates and writes only the locales the filter admits', async () => {
    const bulkCalls: BulkCall[] = []
    const pluginConfig = buildConfig(() => ['de'], bulkCalls)
    const { req, updateCalls } = buildEndpointRequest(
      { collection: 'media', ids: ['doc-1'] },
      { pluginConfig },
    )

    const response = await bulkGenerateAltTextsEndpoint(({ req }) => !!req.user)(req)

    assert.equal(response.status, 200)
    assert.deepEqual(bulkCalls, [{ locales: ['de'] }])
    assert.deepEqual(
      updateCalls.map((call) => call.locale),
      ['de'],
    )
  })

  test('targets every configured locale when no filter is set', async () => {
    const bulkCalls: BulkCall[] = []
    const pluginConfig = buildConfig(undefined, bulkCalls)
    const { req, updateCalls } = buildEndpointRequest(
      { collection: 'media', ids: ['doc-1'] },
      { pluginConfig },
    )

    await bulkGenerateAltTextsEndpoint(({ req }) => !!req.user)(req)

    assert.deepEqual(bulkCalls, [{ locales: ['en', 'de'] }])
    assert.deepEqual(
      updateCalls.map((call) => call.locale),
      ['en', 'de'],
    )
  })

  test('refuses a filter that returns a locale the project does not configure', async () => {
    const bulkCalls: BulkCall[] = []
    const pluginConfig = buildConfig(() => ['fr'], bulkCalls)
    const { req, updateCalls } = buildEndpointRequest(
      { collection: 'media', ids: ['doc-1'] },
      { pluginConfig },
    )

    const response = await bulkGenerateAltTextsEndpoint(({ req }) => !!req.user)(req)

    assert.equal(response.status, 200)
    assert.deepEqual((await response.json()).erroredDocs, ['doc-1'])
    assert.equal(bulkCalls.length, 0)
    assert.equal(updateCalls.length, 0)
  })

  test('refuses a filter that admits no locale at all', async () => {
    const bulkCalls: BulkCall[] = []
    const pluginConfig = buildConfig(() => [], bulkCalls)
    const { req, updateCalls } = buildEndpointRequest(
      { collection: 'media', ids: ['doc-1'] },
      { pluginConfig },
    )

    const response = await bulkGenerateAltTextsEndpoint(({ req }) => !!req.user)(req)

    assert.deepEqual((await response.json()).erroredDocs, ['doc-1'])
    assert.equal(bulkCalls.length, 0)
    assert.equal(updateCalls.length, 0)
  })

  test('passes the configured locales, the request and the document to the filter', async () => {
    const seen: { doc: unknown; locales: string[]; user: unknown }[] = []
    const pluginConfig = buildConfig(({ doc, locales, req }) => {
      seen.push({ doc, locales: [...locales], user: req.user })
      return ['en']
    })
    const { req } = buildEndpointRequest({ collection: 'media', ids: ['doc-1'] }, { pluginConfig })

    await bulkGenerateAltTextsEndpoint(({ req }) => !!req.user)(req)

    assert.equal(seen.length, 1)
    assert.deepEqual(seen[0].locales, ['en', 'de'])
    assert.equal((seen[0].user as { id: string }).id, 'low-priv-user')
    assert.equal((seen[0].doc as { id: string }).id, 'doc-1')
  })
})

describe('filterLocales (single generation)', () => {
  test('rejects a locale the filter excludes with 400 and never writes', async () => {
    const resolveCalls: string[] = []
    const pluginConfig = buildConfig(() => ['de'], [], resolveCalls)
    const { req, updateCalls } = buildEndpointRequest(
      { id: 'doc-1', collection: 'media', locale: 'en', update: true },
      { pluginConfig },
    )

    const response = await generateAltTextEndpoint(({ req }) => !!req.user)(req)

    assert.equal(response.status, 400)
    assert.equal(resolveCalls.length, 0)
    assert.equal(updateCalls.length, 0)
  })

  test('accepts a locale the filter admits', async () => {
    const resolveCalls: string[] = []
    const pluginConfig = buildConfig(() => ['de'], [], resolveCalls)
    const { req } = buildEndpointRequest(
      { id: 'doc-1', collection: 'media', locale: 'de', update: false },
      { pluginConfig },
    )

    const response = await generateAltTextEndpoint(({ req }) => !!req.user)(req)

    assert.equal(response.status, 200)
    assert.deepEqual(resolveCalls, ['de'])
  })
})
