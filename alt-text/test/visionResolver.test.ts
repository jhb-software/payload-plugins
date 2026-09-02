import assert from 'node:assert/strict'

import { afterEach, describe, test } from 'vitest'

import type { PayloadRequest } from 'payload'

import { mistralResolver } from '../src/resolvers/mistral.ts'
import { openAIResolver } from '../src/resolvers/openAI.ts'

/**
 * Both bundled resolvers are built on `createVisionResolver`, which owns the
 * prompt, the required response shape and the reading of the answer. The
 * behaviors pinned here are the ones the factory guarantees on every provider,
 * asserted through the resolvers a user actually configures.
 *
 * They matter because of what may reach the document: the alt text field is
 * required on the collection, so a blank or partial result would satisfy that
 * requirement while telling a screen reader nothing — and nobody reads an alt
 * text again once it is set.
 */

const IMAGE_URL = 'https://example.test/photo-600x400.jpg'
const PIXEL = Buffer.from('89504e470d0a1a0a', 'hex')

const req = {
  payload: { logger: { error() {}, info() {}, warn() {} } },
} as unknown as PayloadRequest

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

const enResult = { en: { altText: 'A camel in front of palm trees.', keywords: ['camel'] } }

type Recorded = { body: Record<string, unknown>; url: string }

/** How often the stubbed thumbnail response had its body read, reset per stub. */
const imageDownload = { bodyReads: 0 }

/**
 * Serves the image download first and the completion second (Mistral inlines
 * the bytes), recording what was sent to the provider.
 */
function stubMistral(
  completion: unknown,
  image: {
    bytes?: Buffer
    contentLength?: null | string
    contentType?: null | string
    status?: number
  } = {},
  finishReason?: string,
): Recorded[] {
  const recorded: Recorded[] = []
  const {
    bytes = PIXEL,
    // A host that names no length is the general case, so the byte-count guard
    // stays under test unless a test opts into the header.
    contentLength = null,
    contentType = 'image/jpeg',
    status: imageStatus = 200,
  } = image
  let call = 0

  imageDownload.bodyReads = 0

  globalThis.fetch = (async (url: string, init?: { body?: string }) => {
    call += 1

    if (call === 1) {
      return {
        arrayBuffer: async () => {
          imageDownload.bodyReads += 1
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        },
        headers: {
          get: (name: string) =>
            name === 'content-type'
              ? contentType
              : name === 'content-length'
                ? contentLength
                : null,
        },
        ok: imageStatus === 200,
        status: imageStatus,
      }
    }

    recorded.push({ body: JSON.parse(init?.body ?? '{}'), url })

    return {
      json: async () => ({
        choices: [
          { finish_reason: finishReason, message: { content: JSON.stringify(completion) } },
        ],
      }),
      ok: true,
      status: 200,
      text: async () => '',
    }
  }) as unknown as typeof fetch

  return recorded
}

/**
 * The OpenAI SDK sends its request through global fetch, so stubbing the
 * network keeps the resolver's own SDK usage under test.
 */
function stubOpenAI(completion: unknown): Recorded[] {
  const recorded: Recorded[] = []

  globalThis.fetch = (async (url: string, init?: { body?: string }) => {
    recorded.push({ body: JSON.parse(init?.body ?? '{}'), url: String(url) })

    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(completion) } }] }),
      { headers: { 'content-type': 'application/json' }, status: 200 },
    )
  }) as unknown as typeof fetch

  return recorded
}

describe('instructions customization', () => {
  test('appends a house style rule to the default instructions without dropping them', async () => {
    const recorded = stubMistral(enResult)

    await mistralResolver({
      apiKey: 'key',
      instructions: ({ defaultInstructions }) =>
        `${defaultInstructions}\n\nAlways mention the brand name "Acme" when its logo is visible.`,
    }).resolve({ imageThumbnailUrl: IMAGE_URL, locale: 'en', req })

    const system = (recorded[0]!.body.messages as { content: string }[])[0]!.content

    assert.match(system, /Always mention the brand name "Acme"/)
    assert.match(system, /expert at analyzing images/)
  })

  test('sends the customized instructions separately from the image', async () => {
    // Replacing the instructions entirely must not be able to drop the image or
    // the required response shape - those are the resolver's contract with its
    // provider, not a rule about the content.
    const recorded = stubOpenAI(enResult)

    await openAIResolver({
      apiKey: 'key',
      instructions: ({ locales }) => `Describe the image in ${locales.join(', ')}.`,
    }).resolve({ imageThumbnailUrl: IMAGE_URL, locale: 'en', req })

    const messages = recorded[0]!.body.messages as {
      content: { image_url?: { url: string }; type: string }[] | string
      role: string
    }[]

    assert.equal(messages[0]!.content, 'Describe the image in en.')
    assert.equal(
      (messages[1]!.content as { image_url?: { url: string } }[])[0]!.image_url!.url,
      IMAGE_URL,
    )
    assert.deepEqual(
      (
        recorded[0]!.body.response_format as {
          json_schema: { schema: { required: string[] } }
        }
      ).json_schema.schema.required,
      ['en'],
    )
  })

  test('receives the locales the response must cover', async () => {
    const recorded = stubMistral({
      de: { altText: 'Ein Kamel vor Palmen.', keywords: ['Kamel'] },
      ...enResult,
    })
    const seen: string[][] = []

    await mistralResolver({
      apiKey: 'key',
      instructions: ({ defaultInstructions, locales }) => {
        seen.push(locales)
        return defaultInstructions
      },
    }).resolveBulk({ imageThumbnailUrl: IMAGE_URL, locales: ['de', 'en'], req })

    assert.deepEqual(seen, [['de', 'en']])
    assert.equal(recorded.length, 1, 'every locale belongs in a single request')
  })
})

describe('response validation', () => {
  test('rejects a blank alt text rather than writing it to the document', async () => {
    stubOpenAI({ en: { altText: '   ', keywords: ['camel'] } })

    const result = await openAIResolver({ apiKey: 'key' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(result.success, false)
  })

  test('rejects a response that is missing one of the requested locales', async () => {
    stubOpenAI(enResult)

    const result = await openAIResolver({ apiKey: 'key' }).resolveBulk({
      imageThumbnailUrl: IMAGE_URL,
      locales: ['de', 'en'],
      req,
    })

    assert.equal(result.success, false)
  })

  test('grants the same token budget for one locale as for several', async () => {
    // Before the factory, OpenAI's bulk path used a flat 300 and only the
    // single-image path used 150. Scaling purely by locale count silently
    // halved the budget for a single-locale project, and a budget spent
    // mid-JSON surfaces as an unreadable parse error.
    const recorded = stubMistral(enResult)

    await mistralResolver({ apiKey: 'key' }).resolveBulk({
      imageThumbnailUrl: IMAGE_URL,
      locales: ['en'],
      req,
    })

    assert.ok(
      (recorded[0]!.body.max_tokens as number) >= 300,
      `one locale must not get less than the pre-factory bulk budget, got ${recorded[0]!.body.max_tokens}`,
    )
  })

  test('names a truncated answer instead of letting it reach JSON.parse', async () => {
    // A budget spent mid-JSON otherwise surfaces as "Unexpected end of JSON
    // input" in the admin panel, which tells an editor nothing to act on.
    stubMistral(enResult, {}, 'length')

    const result = await mistralResolver({ apiKey: 'key' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(result.success, false)
    assert.match(result.success ? '' : (result.error ?? ''), /ran out of tokens/)
  })

  test('reports a thumbnail URL that could not be downloaded', async () => {
    const recorded = stubMistral(enResult, { status: 404 })

    const result = await mistralResolver({ apiKey: 'key' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(result.success, false)
    assert.match(result.success ? '' : (result.error ?? ''), /404/)
    assert.equal(recorded.length, 0, 'the provider must not be called without an image')
  })

  test('reports an empty thumbnail instead of sending zero bytes to the provider', async () => {
    const recorded = stubMistral(enResult, { bytes: Buffer.alloc(0) })

    const result = await mistralResolver({ apiKey: 'key' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(result.success, false)
    assert.match(result.success ? '' : (result.error ?? ''), /empty/)
    assert.equal(recorded.length, 0)
  })

  test('reports an oversized thumbnail before paying to upload it', async () => {
    const recorded = stubMistral(enResult, { bytes: Buffer.alloc(21 * 1024 * 1024) })

    const result = await mistralResolver({ apiKey: 'key' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(result.success, false)
    assert.match(result.success ? '' : (result.error ?? ''), /limit/)
    assert.equal(recorded.length, 0)
  })

  test('rejects a thumbnail the host declares as oversized without reading its body', async () => {
    // getImageThumbnail may point at the original upload, which can be far
    // above the provider's limit. Reading a rejected file into memory to
    // measure it is work the content-length header already answers.
    const recorded = stubMistral(enResult, {
      contentLength: String(21 * 1024 * 1024),
      bytes: PIXEL,
    })

    const result = await mistralResolver({ apiKey: 'key' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(result.success, false)
    assert.match(result.success ? '' : (result.error ?? ''), /limit/)
    assert.equal(imageDownload.bodyReads, 0, 'the body must not be read once the size is known')
    assert.equal(recorded.length, 0)
  })

  test('names the type the host served when it does not identify an image format', async () => {
    // "an unknown type" describes the wrong situation: the host did name a
    // type, it just named a useless one, and `imageThumbnailMimeType` is the
    // option that fixes it.
    stubMistral(enResult, { contentType: 'application/octet-stream' })

    const result = await mistralResolver({ apiKey: 'key' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(result.success, false)
    assert.match(result.success ? '' : (result.error ?? ''), /application\/octet-stream/)
    assert.match(result.success ? '' : (result.error ?? ''), /imageThumbnailMimeType/)
  })

  test('falls back to the declared thumbnail format when the host serves no content type', async () => {
    // `imageThumbnailMimeType` exists for exactly this: a provider that inlines
    // the bytes needs a media type, and a private bucket or a signed URL may
    // serve the file without naming one.
    const recorded = stubMistral(enResult, { contentType: null })

    const result = await mistralResolver({ apiKey: 'key' }).resolve({
      imageThumbnailMimeType: 'image/webp',
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(result.success, true, result.success ? '' : (result.error ?? ''))
    const content = (recorded[0]!.body.messages as { content: { image_url?: string }[] }[])[1]!
      .content
    assert.match(content[0]!.image_url ?? '', /^data:image\/webp;base64,/)
  })

  test('falls back to the declared thumbnail format when the host serves a generic binary type', async () => {
    const recorded = stubMistral(enResult, { contentType: 'application/octet-stream' })

    const result = await mistralResolver({ apiKey: 'key' }).resolve({
      imageThumbnailMimeType: 'image/png',
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(result.success, true, result.success ? '' : (result.error ?? ''))
    const content = (recorded[0]!.body.messages as { content: { image_url?: string }[] }[])[1]!
      .content
    assert.match(content[0]!.image_url ?? '', /^data:image\/png;base64,/)
  })

  test('reports a missing API key instead of calling the provider', async () => {
    // The README wires `enabled: !!process.env.OPENAI_API_KEY` alongside
    // `resolver: openAIResolver({ apiKey: process.env.OPENAI_API_KEY! })`. The
    // resolver argument is evaluated even when the plugin is disabled, so a
    // keyless build must fail with a readable message - and must not spend a
    // request or an image download finding that out.
    const recorded = stubOpenAI(enResult)

    const result = await openAIResolver({ apiKey: '' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(result.success, false)
    assert.match(result.success ? '' : (result.error ?? ''), /OpenAI API key/)
    assert.equal(recorded.length, 0)
  })
})

describe('transient provider failures', () => {
  /** Answers with each queued status in turn, then repeats the last one. */
  function stubStatuses(statuses: number[], completion: unknown): { calls: number } {
    const counter = { calls: 0 }

    globalThis.fetch = (async () => {
      const status = statuses[Math.min(counter.calls, statuses.length - 1)]!
      counter.calls += 1

      return new Response(
        JSON.stringify(
          status < 400
            ? { choices: [{ message: { content: JSON.stringify(completion) } }] }
            : { error: 'upstream' },
        ),
        { headers: { 'content-type': 'application/json' }, status },
      )
    }) as unknown as typeof fetch

    return counter
  }

  test('retries a rate-limited request rather than leaving the image without an alt text', async () => {
    // A bulk generation trips rate limits routinely. Giving up on the first 429
    // silently leaves those documents with no alt text, and the editor has no
    // signal beyond a failed row.
    const counter = stubStatuses([429, 200], enResult)

    const result = await openAIResolver({ apiKey: 'key' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(result.success, true, result.success ? '' : (result.error ?? ''))
    assert.equal(counter.calls, 2)
  })

  test('gives up on a rejected request instead of paying for the same error repeatedly', async () => {
    // A 400 is the request itself being wrong: retrying bills the same failure
    // three times and delays the message the editor needs to see.
    const counter = stubStatuses([400], enResult)

    const result = await openAIResolver({ apiKey: 'key' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(result.success, false)
    assert.match(result.success ? '' : (result.error ?? ''), /400/)
    assert.equal(counter.calls, 1)
  })

  test('stops retrying once the provider keeps failing', async () => {
    const counter = stubStatuses([503], enResult)

    const result = await openAIResolver({ apiKey: 'key' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(result.success, false)
    // The first attempt plus two retries — not an unbounded loop against a
    // provider that is down.
    assert.equal(counter.calls, 3)
  })
})
