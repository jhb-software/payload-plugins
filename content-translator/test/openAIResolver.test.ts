import type { PayloadRequest } from 'payload'

import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'

import { openAIResolver } from '../src/resolvers/openAI.ts'

const originalFetch = globalThis.fetch

// The resolver only reads req.payload.logger; the rest of PayloadRequest is a
// framework boundary we deliberately stub rather than construct.
const noopLogger = { error() {}, info() {}, warn() {} }
const req = { payload: { logger: noopLogger } } as unknown as PayloadRequest

const stubFetch = (content: unknown, ok = true) => {
  const body = JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] })
  globalThis.fetch = async () => new Response(body, { status: ok ? 200 : 500 })
}

const resolve = (texts: string[]) =>
  openAIResolver({ apiKey: 'test' }).resolve({
    localeFrom: 'en',
    localeTo: 'de',
    req,
    texts,
  })

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('openAIResolver - index-keyed reconstruction', () => {
  test('rebuilds translations in input order from an index-keyed object', async () => {
    stubFetch({ translations: { 0: 'eins', 1: 'zwei' } })

    const result = await resolve(['one', 'two'])

    assert.equal(result.success, true)
    assert.deepEqual(result.success && result.translatedTexts, ['eins', 'zwei'])
  })

  test('reorders out-of-order keys back to the input order', async () => {
    stubFetch({ translations: { 1: 'zwei', 0: 'eins' } })

    const result = await resolve(['one', 'two'])

    assert.deepEqual(result.success && result.translatedTexts, ['eins', 'zwei'])
  })

  test('keeps the original text for a missing key instead of shifting later values', async () => {
    // The model dropped key "1"; without index reconstruction "three" would
    // shift up into slot 1 and corrupt every later field.
    stubFetch({ translations: { 0: 'eins', 2: 'drei' } })

    const result = await resolve(['one', 'two', 'three'])

    assert.deepEqual(result.success && result.translatedTexts, ['eins', 'two', 'drei'])
  })

  test('tolerates an array response for backwards compatibility', async () => {
    stubFetch({ translations: ['eins', 'zwei'] })

    const result = await resolve(['one', 'two'])

    assert.deepEqual(result.success && result.translatedTexts, ['eins', 'zwei'])
  })

  test('rejects a bare-string "translations" value rather than indexing it char by char', async () => {
    stubFetch({ translations: 'einszwei' })

    const result = await resolve(['one', 'two'])

    assert.equal(result.success, false)
  })

  test('keeps the original for a non-string value at an index', async () => {
    stubFetch({ translations: { 0: 'eins', 1: 42 } })

    const result = await resolve(['one', 'two'])

    assert.deepEqual(result.success && result.translatedTexts, ['eins', 'two'])
  })
})
