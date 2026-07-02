import assert from 'node:assert/strict'

import { afterEach, beforeEach, test } from 'vitest'

import { openAIResolver } from '../src/resolvers/openAI.ts'

/**
 * A common setup wires the plugin as
 *
 *   payloadAltTextPlugin({
 *     enabled: !!process.env.OPENAI_API_KEY,
 *     resolver: openAIResolver({ apiKey: process.env.OPENAI_API_KEY! }),
 *   })
 *
 * The `resolver` argument is evaluated regardless of `enabled`, so on a machine
 * without the key `openAIResolver(...)` still runs. It must not construct the
 * OpenAI client at that point — otherwise the SDK throws "Missing credentials"
 * and the whole Payload config fails to load even though the plugin is off.
 */
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
