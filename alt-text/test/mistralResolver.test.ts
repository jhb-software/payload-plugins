import assert from 'node:assert/strict'

import { afterEach, describe, test } from 'vitest'

import type { PayloadRequest } from 'payload'

import { mistralResolver } from '../src/resolvers/mistral.ts'

/**
 * The Mistral resolver differs from the OpenAI one in a way that is easy to
 * regress: it downloads the image and sends the bytes instead of handing the
 * provider a URL. That is not a preference. Mistral's own fetcher needs the file
 * to be reachable from the public internet — never true in local development,
 * not true for private buckets — and some hosts refuse it outright with
 * `File could not be fetched from url` (error 3310). Switching back to a URL
 * would leave those setups generating nothing, with the failure only visible in
 * a provider error message.
 *
 * The other behaviors pinned here concern what may reach the document: the alt
 * text field is required on the collection, so a blank or partial result would
 * satisfy that requirement while telling a screen reader nothing — and nobody
 * reads an alt text again once it is set.
 */

const IMAGE_URL = 'https://example.test/photo-600x400.jpg'
const PIXEL = Buffer.from('89504e470d0a1a0a', 'hex')

type Recorded = { body: Record<string, unknown>; url: string }

/**
 * Replaces global fetch with a stub that serves the image first and the
 * completion second, recording every request so a test can assert what was
 * actually sent to the provider.
 */
function stubFetch(options: {
  completion?: unknown
  contentType?: string
  imageStatus?: number
  status?: number
}): Recorded[] {
  const recorded: Recorded[] = []
  const { completion, contentType = 'image/jpeg', imageStatus = 200, status = 200 } = options
  let call = 0

  globalThis.fetch = (async (url: string, init?: { body?: string }) => {
    call += 1

    if (call === 1) {
      return {
        arrayBuffer: async () => PIXEL.buffer.slice(PIXEL.byteOffset, PIXEL.byteOffset + PIXEL.byteLength),
        headers: { get: (name: string) => (name === 'content-type' ? contentType : null) },
        ok: imageStatus === 200,
        status: imageStatus,
      }
    }

    recorded.push({ body: JSON.parse(init?.body ?? '{}'), url })

    return {
      json: async () => ({ choices: [{ message: { content: JSON.stringify(completion) } }] }),
      ok: status === 200,
      status,
      text: async () => 'error body',
    }
  }) as unknown as typeof fetch

  return recorded
}

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

const req = { payload: { logger: console } } as unknown as PayloadRequest

const threeLocales = {
  de: { altText: 'Ein Kamel vor Palmen.', keywords: ['Kamel', 'Palmen'] },
  en: { altText: 'A camel in front of palm trees.', keywords: ['camel', 'palm trees'] },
  fr: { altText: 'Un chameau devant des palmiers.', keywords: ['chameau', 'palmiers'] },
}

describe('mistral resolver', () => {
  test('sends the image bytes to the provider instead of the URL', async () => {
    const recorded = stubFetch({ completion: { en: threeLocales.en } })

    await mistralResolver({ apiKey: 'key' }).resolve({ imageThumbnailUrl: IMAGE_URL, locale: 'en', req })

    const content = (recorded[0]!.body.messages as { content: { image_url?: string }[] }[])[1]!
      .content

    assert.match(content[0]!.image_url!, /^data:image\/jpeg;base64,/)
    assert.doesNotMatch(content[0]!.image_url!, /example\.test/)
  })

  test('asks for every locale in a single request', async () => {
    const recorded = stubFetch({ completion: threeLocales })

    const result = await mistralResolver({ apiKey: 'key' }).resolveBulk({
      imageThumbnailUrl: IMAGE_URL,
      locales: ['de', 'en', 'fr'],
      req,
    })

    assert.equal(recorded.length, 1)
    assert.deepEqual(
      (recorded[0]!.body.response_format as { json_schema: { schema: { required: string[] } } })
        .json_schema.schema.required,
      ['de', 'en', 'fr'],
    )
    assert.equal(result.success, true)
    assert.deepEqual(Object.keys(result.success ? result.results : {}), ['de', 'en', 'fr'])
  })

  test('rejects a response that is missing one of the requested locales', async () => {
    stubFetch({ completion: { de: threeLocales.de, en: threeLocales.en } })

    const result = await mistralResolver({ apiKey: 'key' }).resolveBulk({
      imageThumbnailUrl: IMAGE_URL,
      locales: ['de', 'en', 'fr'],
      req,
    })

    assert.equal(result.success, false)
  })

  test('rejects a blank alt text rather than writing it to the document', async () => {
    stubFetch({ completion: { en: { altText: '   ', keywords: ['camel'] } } })

    const result = await mistralResolver({ apiKey: 'key' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(result.success, false)
  })

  test('reports the format when the thumbnail is served as something Mistral cannot read', async () => {
    // An upload collection may hold SVG or AVIF, and `getImageThumbnail` falls
    // back to the original when no derivative exists. Naming the format beats a
    // provider-side error that says nothing about which file was at fault.
    const recorded = stubFetch({ completion: {}, contentType: 'image/svg+xml' })

    const result = await mistralResolver({ apiKey: 'key' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(result.success, false)
    assert.match(result.success ? '' : (result.error ?? ''), /svg/)
    assert.equal(recorded.length, 0, 'the provider must not be called for an unreadable format')
  })

  test('reports a missing API key instead of throwing when the resolver is built', async () => {
    // The README wires `enabled: !!process.env.MISTRAL_API_KEY` alongside
    // `resolver: mistralResolver({ apiKey: process.env.MISTRAL_API_KEY! })`.
    // The resolver argument is evaluated even when the plugin is disabled, so
    // constructing it without a key must not break the Payload config.
    const recorded = stubFetch({ completion: {} })

    const result = await mistralResolver({ apiKey: '' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(result.success, false)
    assert.equal(recorded.length, 0)
  })
})
