import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import {
  buildEndpointRequest as buildRequest,
  buildPluginConfig,
} from './support/endpointHarness.ts'
import { bulkGenerateAltTextsEndpoint } from '../src/endpoints/bulkGenerateAltTexts.ts'
import { generateAltTextEndpoint } from '../src/endpoints/generateAltText.ts'

/**
 * The endpoints must treat the configured `collections` as an allowlist. A
 * request naming a collection the plugin does not manage (e.g. `users`) must be
 * rejected with `403` before any Local API call — otherwise the endpoints can be
 * pointed at any collection in the app, widening the blast radius of the
 * access-control surface to the entire data model.
 */

describe('generate endpoint collection allowlist', () => {
  test('rejects a collection the plugin does not manage with 403 and no Local API call', async () => {
    const { findByIDCalls, req, updateCalls } = buildRequest({
      id: 'doc-1',
      collection: 'users',
      locale: 'en',
      update: true,
    })

    const response = await generateAltTextEndpoint(buildPluginConfig().access)(req)

    assert.equal(response.status, 403)
    assert.equal(findByIDCalls.length, 0)
    assert.equal(updateCalls.length, 0)
  })

  test('allows a configured collection', async () => {
    const { findByIDCalls, req } = buildRequest({
      id: 'doc-1',
      collection: 'media',
      locale: 'en',
      update: false,
    })

    const response = await generateAltTextEndpoint(buildPluginConfig().access)(req)

    assert.equal(response.status, 200)
    assert.equal(findByIDCalls.length, 1)
  })
})

describe('bulk generate endpoint collection allowlist', () => {
  test('rejects a collection the plugin does not manage with 403 and no Local API call', async () => {
    const { findByIDCalls, req, updateCalls } = buildRequest({
      collection: 'users',
      ids: ['doc-1', 'doc-2'],
    })

    const response = await bulkGenerateAltTextsEndpoint(buildPluginConfig().access)(req)

    assert.equal(response.status, 403)
    assert.equal(findByIDCalls.length, 0)
    assert.equal(updateCalls.length, 0)
  })

  test('allows a configured collection', async () => {
    const { findByIDCalls, req } = buildRequest({ collection: 'media', ids: ['doc-1'] })

    const response = await bulkGenerateAltTextsEndpoint(buildPluginConfig().access)(req)

    assert.equal(response.status, 200)
    assert.equal(findByIDCalls.length, 1)
  })
})
