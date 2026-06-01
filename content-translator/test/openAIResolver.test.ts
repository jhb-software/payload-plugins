import type { PayloadRequest } from 'payload'

import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'

import { openAIResolver } from '../src/resolvers/openAI.ts'

/** Minimal req with a no-op logger, which is all the resolver touches. */
const makeReq = (): PayloadRequest =>
  ({
    payload: { logger: { error: () => {}, info: () => {} } },
  }) as unknown as PayloadRequest

type FetchResponder = (body: { messages: { content: string }[] }) => {
  data?: unknown
  ok?: boolean
}

const originalFetch = globalThis.fetch

/** Stubs global fetch with a responder that sees the parsed request body. */
const stubFetch = (responder: FetchResponder, capture?: { bodies: any[] }) => {
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body)
    capture?.bodies.push(body)
    const { data, ok = true } = responder(body)
    return {
      json: async () => data,
      ok,
    }
  }) as unknown as typeof fetch
}

/** A custom prompt that serializes the chunk's texts as a JSON array the stub can read back. */
const echoablePrompt = ({ texts }: { texts: string[] }) => JSON.stringify(texts)

const textsFromBody = (body: { messages: { content: string }[] }): string[] =>
  JSON.parse(body.messages[0].content)

const chatResponse = (content: unknown) => ({
  data: { choices: [{ message: { content: JSON.stringify(content) } }] },
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('openAIResolver - keyed mapping keeps translations aligned to their source', () => {
  test('a dropped/merged key leaves only that fragment untranslated instead of shifting later ones', async () => {
    // Reproduces the GPT-4o-mini failure: indices 1 and 2 ("Die " + "Höhenkrankheit")
    // get merged into one value, so the model returns no key "2".
    stubFetch((body) => {
      const texts = textsFromBody(body)
      assert.equal(texts.length, 5)
      return chatResponse({
        translations: {
          '0': `T:${texts[0]}`,
          '1': `T:${texts[1]}+${texts[2]}`, // merged
          '3': `T:${texts[3]}`,
          '4': `T:${texts[4]}`,
          // key "2" is missing
        },
      })
    })

    const resolver = openAIResolver({ apiKey: 'x', prompt: echoablePrompt })
    const result = await resolver.resolve({
      localeFrom: 'de',
      localeTo: 'en',
      req: makeReq(),
      texts: ['a', 'b', 'c', 'd', 'e'],
    })

    assert.equal(result.success, true)
    assert.ok(result.success)
    assert.equal(result.translatedTexts.length, 5)
    // The dropped fragment falls back to its source, every later field stays aligned.
    assert.deepEqual(result.translatedTexts, ['T:a', 'T:b+c', 'c', 'T:d', 'T:e'])
  })

  test('a complete keyed response translates every fragment', async () => {
    stubFetch((body) => {
      const texts = textsFromBody(body)
      return chatResponse({
        translations: Object.fromEntries(texts.map((t, i) => [String(i), `T:${t}`])),
      })
    })

    const resolver = openAIResolver({ apiKey: 'x', prompt: echoablePrompt })
    const result = await resolver.resolve({
      localeFrom: 'de',
      localeTo: 'en',
      req: makeReq(),
      texts: ['one', 'two', 'three'],
    })

    assert.ok(result.success)
    assert.deepEqual(result.translatedTexts, ['T:one', 'T:two', 'T:three'])
  })

  test('chunks are reassembled in global order even though each chunk is keyed from 0', async () => {
    stubFetch((body) => {
      const texts = textsFromBody(body)
      return chatResponse({
        translations: Object.fromEntries(texts.map((t, i) => [String(i), `T:${t}`])),
      })
    })

    const resolver = openAIResolver({ apiKey: 'x', chunkLength: 2, prompt: echoablePrompt })
    const result = await resolver.resolve({
      localeFrom: 'de',
      localeTo: 'en',
      req: makeReq(),
      texts: ['a', 'b', 'c', 'd', 'e'],
    })

    assert.ok(result.success)
    assert.deepEqual(result.translatedTexts, ['T:a', 'T:b', 'T:c', 'T:d', 'T:e'])
  })

  test('a legacy array response is accepted and normalized to the input length', async () => {
    stubFetch((body) => {
      const texts = textsFromBody(body)
      // Model returns a positional array missing the last entry.
      return chatResponse({ translations: texts.slice(0, -1).map((t) => `T:${t}`) })
    })

    const resolver = openAIResolver({ apiKey: 'x', prompt: echoablePrompt })
    const result = await resolver.resolve({
      localeFrom: 'de',
      localeTo: 'en',
      req: makeReq(),
      texts: ['a', 'b', 'c'],
    })

    assert.ok(result.success)
    assert.deepEqual(result.translatedTexts, ['T:a', 'T:b', 'c'])
  })

  test('fails when "translations" is neither an array nor an object', async () => {
    stubFetch(() => chatResponse({ translations: 'not a structure' }))

    const resolver = openAIResolver({ apiKey: 'x', prompt: echoablePrompt })
    const result = await resolver.resolve({
      localeFrom: 'de',
      localeTo: 'en',
      req: makeReq(),
      texts: ['a'],
    })

    assert.equal(result.success, false)
  })

  test('default prompt sends the texts keyed by index', async () => {
    const capture = { bodies: [] as any[] }
    stubFetch(() => chatResponse({ translations: { '0': 'first', '1': 'second' } }), capture)

    // Use the default prompt this time (no custom prompt override).
    const resolver = openAIResolver({ apiKey: 'x' })
    await resolver.resolve({
      localeFrom: 'de',
      localeTo: 'en',
      req: makeReq(),
      texts: ['first', 'second'],
    })

    const sentContent = capture.bodies[0].messages[0].content as string
    assert.match(sentContent, /"0": "first"/)
    assert.match(sentContent, /"1": "second"/)
  })
})
