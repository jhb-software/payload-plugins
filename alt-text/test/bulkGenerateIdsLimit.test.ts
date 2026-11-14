import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import { bulkGenerateAltTextsEndpoint } from '../src/endpoints/bulkGenerateAltTexts.ts'
import { buildEndpointRequest, buildPluginConfig } from './support/endpointHarness.ts'

/**
 * The bulk endpoint bounds and de-duplicates the `ids` array so a single
 * request cannot fan out into an unbounded number of paid resolver calls.
 */

/**
 * Builds a request for the bulk endpoint with the given per-request id limit.
 * The endpoint reads each id via `findByID`, so the recorded `findByIDCalls`
 * reveal exactly which ids made it past the bound/de-duplication step — read
 * them via `resolvedIds()` after invoking the endpoint.
 */
function buildRequest(body: unknown, maxBulkGenerateIds: number) {
  const pluginConfig = buildPluginConfig({ maxBulkGenerateIds })
  const { findByIDCalls, req } = buildEndpointRequest(body, { pluginConfig })

  return { req, resolvedIds: () => findByIDCalls.map((call) => call.id as number | string) }
}

describe('bulk generate ids limit', () => {
  test('rejects a batch larger than the configured maximum without generating anything', async () => {
    const { req, resolvedIds } = buildRequest({ collection: 'media', ids: ['a', 'b', 'c'] }, 2)

    const response = await bulkGenerateAltTextsEndpoint(buildPluginConfig().access)(req)

    assert.equal(response.status, 400)
    assert.equal(resolvedIds().length, 0)
  })

  test('collapses duplicate ids so each image is generated only once', async () => {
    const { req, resolvedIds } = buildRequest({ collection: 'media', ids: ['a', 'a', 'b'] }, 100)

    const response = await bulkGenerateAltTextsEndpoint(buildPluginConfig().access)(req)
    const result = (await response.json()) as { totalDocs: number; updatedDocs: number }

    assert.deepEqual(resolvedIds().sort(), ['a', 'b'])
    assert.equal(result.totalDocs, 2)
    assert.equal(result.updatedDocs, 2)
  })

  test('counts deduplicated ids against the limit, not the raw array length', async () => {
    // Six raw ids but only two distinct — must pass a limit of 2.
    const { req, resolvedIds } = buildRequest(
      { collection: 'media', ids: ['a', 'a', 'a', 'b', 'b', 'b'] },
      2,
    )

    const response = await bulkGenerateAltTextsEndpoint(buildPluginConfig().access)(req)

    assert.equal(response.status, 200)
    assert.deepEqual(resolvedIds().sort(), ['a', 'b'])
  })
})
