import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import type { AltTextResolver } from '../src/resolvers/types.ts'

import { bulkGenerateAltTextsEndpoint } from '../src/endpoints/bulkGenerateAltTexts.ts'
import { buildPluginConfig, testUser } from './support/endpointHarness.ts'
import type { LocalApiCall } from './support/endpointHarness.ts'

/**
 * A list-view selection holds whatever was uploaded. Files that are not failures
 * of the run are reported as skipped, with the reason that decides what the editor
 * has to do: a file the collection does not track needs no alt text at all, while
 * a tracked one the resolver cannot read still needs it written by hand.
 */

const DOCS: Record<string, { filename: string; mimeType: string }> = {
  logo: { filename: 'logo.svg', mimeType: 'image/svg+xml' },
  manual: { filename: 'manual.pdf', mimeType: 'application/pdf' },
  photo: { filename: 'photo.png', mimeType: 'image/png' },
  broken: { filename: 'broken.png', mimeType: 'image/png' },
}

function buildRequest(ids: string[]) {
  const resolveCalls: string[] = []
  const updateCalls: LocalApiCall[] = []

  const resolveBulk: AltTextResolver['resolveBulk'] = async ({ filename }) => {
    resolveCalls.push(filename!)

    if (filename === 'broken.png') {
      return { success: false, error: 'provider refused the image' }
    }

    return { success: true, results: { en: { altText: 'generated alt', keywords: ['a'] } } }
  }

  const pluginConfig = buildPluginConfig({
    resolver: {
      key: 'mock',
      resolve: async () => ({
        success: true,
        result: { altText: 'generated alt', keywords: ['a'] },
      }),
      resolveBulk,
      supportedMimeTypes: ['image/png', 'image/jpeg'],
    },
  })

  const req = {
    json: async () => ({ collection: 'media', ids }),
    payload: {
      config: { custom: { altTextPluginConfig: pluginConfig } },
      logger: { error: () => {}, info: () => {}, warn: () => {} },
      findByID: async ({ id }: { id: string }) => ({ id, ...DOCS[id] }),
      update: async (args: LocalApiCall) => {
        updateCalls.push(args)
        return { id: args.id }
      },
    },
    user: testUser,
  } as unknown as Parameters<ReturnType<typeof bulkGenerateAltTextsEndpoint>>[0]

  return { req, resolveCalls, updateCalls }
}

const runBulk = async (ids: string[]) => {
  const { req, resolveCalls, updateCalls } = buildRequest(ids)
  const response = await bulkGenerateAltTextsEndpoint(({ req }) => !!req.user)(req)

  return { body: await response.json(), resolveCalls, response, updateCalls }
}

describe('bulk generation of files the resolver cannot read', () => {
  test('skips a tracked format the resolver cannot read, and says it needs writing by hand', async () => {
    const { body, resolveCalls, updateCalls } = await runBulk(['logo', 'photo'])

    assert.deepEqual(body.skippedDocs, [{ id: 'logo', reason: 'unsupportedFormat' }])
    assert.deepEqual(body.erroredDocs, [])
    assert.equal(body.updatedDocs, 1)
    assert.equal(body.totalDocs, 2)
    assert.deepEqual(resolveCalls, ['photo.png'])
    assert.deepEqual(
      updateCalls.map((call) => call.id),
      ['photo'],
    )
  })

  test('skips a file the collection does not track as needing no alt text', async () => {
    const { body, resolveCalls } = await runBulk(['manual'])

    assert.deepEqual(body.skippedDocs, [{ id: 'manual', reason: 'notTracked' }])
    assert.deepEqual(body.erroredDocs, [])
    assert.equal(resolveCalls.length, 0)
  })

  test('still reports a generation that genuinely failed as an error', async () => {
    const { body } = await runBulk(['broken'])

    assert.deepEqual(body.erroredDocs, ['broken'])
    assert.deepEqual(body.skippedDocs, [])
  })
})
