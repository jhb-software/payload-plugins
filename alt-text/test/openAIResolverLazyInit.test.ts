import assert from 'node:assert/strict'

import { afterEach, beforeEach, describe, test } from 'vitest'

import { openAIResolver } from '../src/resolvers/openAI.ts'

/**
 * A common setup wires the plugin as
 *
 *   payloadAltTextPlugin({
 *     enabled: !!process.env.OPENAI_API_KEY,
 *     resolver: openAIResolver({ apiKey: process.env.OPENAI_API_KEY! }),
 *   })
 *
 * The `resolver` argument is evaluated eagerly regardless of `enabled`, so on a
 * machine without the key (`enabled: false`) `openAIResolver(...)` still runs.
 * It must not construct the OpenAI client at that point — otherwise the SDK
 * throws "Missing credentials" and the whole Payload config fails to load even
 * though the plugin was deliberately turned off.
 */
describe('openAIResolver lazy client construction', () => {
  let savedKey: string | undefined

  beforeEach(() => {
    savedKey = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY
  })

  afterEach(() => {
    if (savedKey === undefined) {
      delete process.env.OPENAI_API_KEY
    } else {
      process.env.OPENAI_API_KEY = savedKey
    }
  })

  test('building the resolver without an API key does not throw', () => {
    assert.doesNotThrow(() => {
      openAIResolver({ apiKey: process.env.OPENAI_API_KEY as string })
    })
  })

  test('the resolver built without a key is still a usable resolver object', () => {
    const resolver = openAIResolver({ apiKey: process.env.OPENAI_API_KEY as string })

    assert.equal(resolver.key, 'openai')
    assert.equal(typeof resolver.resolve, 'function')
    assert.equal(typeof resolver.resolveBulk, 'function')
  })

  test('the missing-key error surfaces when resolve() is called, not at build time', async () => {
    const resolver = openAIResolver({ apiKey: process.env.OPENAI_API_KEY as string })

    const response = await resolver.resolve({
      filename: 'photo.jpg',
      imageThumbnailUrl: 'https://example.com/thumb.jpg',
      locale: 'en',
      req: {} as never,
    })

    assert.equal(response.success, false)
  })
})
