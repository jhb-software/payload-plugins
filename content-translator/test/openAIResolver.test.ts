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

type Message = { content: string; role: string }

/** Captures the messages sent to the API and answers with a valid translation. */
const stubFetchCapturingMessages = (sentMessages: Message[][]) => {
  globalThis.fetch = async (_url, init) => {
    const requestBody = JSON.parse(String(init?.body)) as { messages: Message[] }
    sentMessages.push(requestBody.messages)

    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ translations: { 0: 'eins' } }) } }],
      }),
      { status: 200 },
    )
  }
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

describe('openAIResolver - instructions customization', () => {
  test('sends the instructions as the system message and the texts as the user message', async () => {
    const sentMessages: Message[][] = []
    stubFetchCapturingMessages(sentMessages)

    await openAIResolver({ apiKey: 'test' }).resolve({
      localeFrom: 'en',
      localeTo: 'de',
      req,
      texts: ['one'],
    })

    assert.equal(sentMessages.length, 1)
    const [system, user] = sentMessages[0]!
    assert.equal(system!.role, 'system')
    assert.match(system!.content, /Return ONLY a valid JSON object/)
    assert.equal(user!.role, 'user')
    assert.deepEqual(JSON.parse(user!.content), { 0: 'one' })
  })

  test('appends protected terms to the default instructions without dropping them', async () => {
    const sentMessages: Message[][] = []
    stubFetchCapturingMessages(sentMessages)

    await openAIResolver({
      apiKey: 'test',
      instructions: ({ defaultInstructions }) =>
        `${defaultInstructions}\n\nNever translate the brand name "Acme".`,
    }).resolve({ localeFrom: 'en', localeTo: 'de', req, texts: ['one'] })

    const [system] = sentMessages[0]!
    assert.match(system!.content, /Never translate the brand name "Acme"\./)
    assert.match(system!.content, /Return ONLY a valid JSON object/)
  })

  test('keeps the JSON mode instructions when the instructions are replaced entirely', async () => {
    const sentMessages: Message[][] = []
    stubFetchCapturingMessages(sentMessages)

    await openAIResolver({
      apiKey: 'test',
      instructions: ({ localeFrom, localeTo }) => `Translate from ${localeFrom} to ${localeTo}`,
    }).resolve({ localeFrom: 'EN', localeTo: 'DE', req, texts: ['one'] })

    const [system, user] = sentMessages[0]!
    // Locales reach the instructions lowercased, as ISO 639 codes.
    assert.match(system!.content, /^Translate from en to de/)
    // The request is sent with response_format: json_object, which OpenAI
    // rejects unless the messages mention JSON - and the parser needs the
    // "translations" shape - so both survive a full replacement.
    assert.match(system!.content, /Return ONLY a valid JSON object/)
    assert.match(system!.content, /"translations"/)
    assert.deepEqual(JSON.parse(user!.content), { 0: 'one' })
  })

  test('sends every chunk the same instructions with its own texts', async () => {
    const sentMessages: Message[][] = []
    stubFetchCapturingMessages(sentMessages)

    await openAIResolver({
      apiKey: 'test',
      chunkLength: 1,
      instructions: ({ defaultInstructions }) => `${defaultInstructions}\n\nKeep "Acme".`,
    }).resolve({ localeFrom: 'en', localeTo: 'de', req, texts: ['one', 'two'] })

    assert.equal(sentMessages.length, 2)
    assert.ok(sentMessages.every(([system]) => /Keep "Acme"\./.test(system!.content)))
    assert.deepEqual(JSON.parse(sentMessages[0]![1]!.content), { 0: 'one' })
    assert.deepEqual(JSON.parse(sentMessages[1]![1]!.content), { 0: 'two' })
  })
})
