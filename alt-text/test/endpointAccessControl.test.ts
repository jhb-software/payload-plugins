import assert from 'node:assert/strict'

import { Forbidden } from 'payload'
import { describe, test } from 'vitest'

import type { PayloadRequest } from 'payload'

import type { AltTextPluginConfig } from '../src/types/AltTextPluginConfig.ts'

import { bulkGenerateAltTextsEndpoint } from '../src/endpoints/bulkGenerateAltTexts.ts'
import { generateAltTextEndpoint } from '../src/endpoints/generateAltText.ts'

/**
 * These tests protect against GHSA-4qpv-39hg-f7fx: the endpoints called the
 * Payload Local API without `overrideAccess: false`, so any authenticated user
 * could read and overwrite alt/keywords on documents their role should not be
 * able to touch. Every Local API call the endpoints make must run under the
 * requesting user's access (`overrideAccess: false` + `user: req.user`).
 */

const user = { id: 'low-priv-user', email: 'user@example.com', role: 'user' }

type LocalApiCall = Record<string, unknown>

function buildPluginConfig(): AltTextPluginConfig {
  return {
    access: ({ req }) => !!req.user,
    collections: [{ slug: 'media', mimeTypes: ['image/*'] }],
    enabled: true,
    getImageThumbnail: () => 'https://example.com/thumb.png',
    healthCheck: true,
    healthCheckAccess: ({ req }) => !!req.user,
    locale: 'en',
    locales: [],
    maxBulkGenerateConcurrency: 1,
    resolver: {
      key: 'mock',
      resolve: async () => ({
        success: true,
        result: { altText: 'generated alt', keywords: ['a', 'b'] },
      }),
      resolveBulk: async () => ({
        success: true,
        results: { en: { altText: 'generated alt', keywords: ['a', 'b'] } },
      }),
    },
  }
}

function buildRequest(body: unknown): {
  findByIDCalls: LocalApiCall[]
  req: PayloadRequest
  updateCalls: LocalApiCall[]
} {
  const findByIDCalls: LocalApiCall[] = []
  const updateCalls: LocalApiCall[] = []

  const req = {
    json: async () => body,
    payload: {
      config: { custom: { altTextPluginConfig: buildPluginConfig() } },
      findByID: async (args: LocalApiCall) => {
        findByIDCalls.push(args)
        return { id: args.id, filename: 'photo.png', mimeType: 'image/png' }
      },
      update: async (args: LocalApiCall) => {
        updateCalls.push(args)
        return { id: args.id }
      },
    },
    user,
  } as unknown as PayloadRequest

  return { findByIDCalls, req, updateCalls }
}

describe('generate endpoint access control', () => {
  test('reads the document under the requesting user, not with overridden access', async () => {
    const { findByIDCalls, req } = buildRequest({
      id: 'doc-1',
      collection: 'media',
      locale: 'en',
      update: false,
    })

    await generateAltTextEndpoint(buildPluginConfig().access)(req)

    assert.equal(findByIDCalls.length, 1)
    assert.equal(findByIDCalls[0].overrideAccess, false)
    assert.equal(findByIDCalls[0].user, user)
  })

  test('writes alt text under the requesting user, not with overridden access', async () => {
    const { req, updateCalls } = buildRequest({
      id: 'doc-1',
      collection: 'media',
      locale: 'en',
      update: true,
    })

    await generateAltTextEndpoint(buildPluginConfig().access)(req)

    assert.equal(updateCalls.length, 1)
    assert.equal(updateCalls[0].overrideAccess, false)
    assert.equal(updateCalls[0].user, user)
  })
})

describe('generate endpoint denial responses', () => {
  test('returns 403 (not 500) when the user lacks read access to the document', async () => {
    const { req } = buildRequest({ id: 'doc-1', collection: 'media', locale: null, update: false })
    req.payload.findByID = async () => {
      throw new Forbidden(req.t)
    }

    const response = await generateAltTextEndpoint(buildPluginConfig().access)(req)

    assert.equal(response.status, 403)
  })

  test('returns 403 (not 500) when the user lacks update access to the document', async () => {
    const { req } = buildRequest({ id: 'doc-1', collection: 'media', locale: null, update: true })
    req.payload.update = async () => {
      throw new Forbidden(req.t)
    }

    const response = await generateAltTextEndpoint(buildPluginConfig().access)(req)

    assert.equal(response.status, 403)
  })
})

describe('bulk generate endpoint access control', () => {
  test('reads each document under the requesting user, not with overridden access', async () => {
    const { findByIDCalls, req } = buildRequest({ collection: 'media', ids: ['doc-1'] })

    await bulkGenerateAltTextsEndpoint(buildPluginConfig().access)(req)

    assert.equal(findByIDCalls.length, 1)
    assert.equal(findByIDCalls[0].overrideAccess, false)
    assert.equal(findByIDCalls[0].user, user)
  })

  test('writes each document under the requesting user, not with overridden access', async () => {
    const { req, updateCalls } = buildRequest({ collection: 'media', ids: ['doc-1'] })

    await bulkGenerateAltTextsEndpoint(buildPluginConfig().access)(req)

    assert.equal(updateCalls.length, 1)
    assert.equal(updateCalls[0].overrideAccess, false)
    assert.equal(updateCalls[0].user, user)
  })

  test('returns 403 (not 200 with errored ids) when the user lacks access to the collection', async () => {
    const { req } = buildRequest({ collection: 'media', ids: ['doc-1', 'doc-2'] })
    req.payload.findByID = async () => {
      throw new Forbidden(req.t)
    }

    const response = await bulkGenerateAltTextsEndpoint(buildPluginConfig().access)(req)

    assert.equal(response.status, 403)
  })
})
