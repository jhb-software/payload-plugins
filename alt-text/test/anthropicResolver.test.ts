import assert from 'node:assert/strict'

import { afterEach, describe, test } from 'vitest'

import type { PayloadRequest } from 'payload'

import { anthropicResolver } from '../src/resolvers/anthropic.ts'

/**
 * The Messages API differs from the OpenAI-compatible shape in ways that are
 * easy to get wrong and that fail only against the real provider: the image
 * travels as a base64 block carrying its own `media_type` (which is why the
 * bytes are downloaded rather than the URL passed along — a media type cannot
 * be sniffed from a URL), the instructions travel as the top-level `system`
 * parameter rather than as a message, and the required response shape goes in
 * `output_config.format`.
 *
 * A refusal and a truncated answer both come back as HTTP 200 with content the
 * plugin cannot use, so they are pinned too: without naming them, an editor
 * would see a JSON parse error and have no idea what went wrong.
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

type Recorded = { body: Record<string, unknown>; headers: Record<string, string>; url: string }

/** Serves the image download first and the Messages API response second. */
function stubFetch(
  options: { bytes?: Buffer; contentType?: string; message?: unknown; status?: number } = {},
): Recorded[] {
  const {
    bytes = PIXEL,
    contentType = 'image/jpeg',
    message = { content: [{ type: 'text', text: '{}' }] },
  } = options
  const status = options.status ?? 200
  const recorded: Recorded[] = []
  let call = 0

  globalThis.fetch = (async (
    url: string,
    init?: { body?: string; headers?: Record<string, string> },
  ) => {
    call += 1

    if (call === 1) {
      return {
        arrayBuffer: async () =>
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        headers: { get: (name: string) => (name === 'content-type' ? contentType : null) },
        ok: true,
        status: 200,
      }
    }

    recorded.push({ body: JSON.parse(init?.body ?? '{}'), headers: init?.headers ?? {}, url })

    return {
      json: async () => message,
      ok: status === 200,
      status,
      text: async () => 'error body',
    }
  }) as unknown as typeof fetch

  return recorded
}

const textMessage = (payload: unknown) => ({
  content: [{ type: 'text', text: JSON.stringify(payload) }],
  stop_reason: 'end_turn',
})

describe('anthropic resolver', () => {
  test('reads the JSON past the thinking blocks Claude emits before it', async () => {
    // Thinking is on by default on the default model, so the text block is not
    // content[0]. Indexing rather than searching for the text block would make
    // every generation fail against the real API while this suite stayed green.
    const recorded = stubFetch({
      message: {
        content: [
          { type: 'thinking', thinking: '' },
          { type: 'text', text: JSON.stringify(enResult) },
        ],
        stop_reason: 'end_turn',
      },
    })

    const result = await anthropicResolver({ apiKey: 'key' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(recorded.length, 1)
    assert.equal(result.success, true)
  })

  test('reports the status when the provider rejects the request', async () => {
    stubFetch({ message: { type: 'error' }, status: 429 })

    const result = await anthropicResolver({ apiKey: 'key' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(result.success, false)
    assert.match(result.success ? '' : (result.error ?? ''), /429/)
  })

  test('reports a response carrying no text block', async () => {
    stubFetch({
      message: { content: [{ type: 'thinking', thinking: '' }], stop_reason: 'end_turn' },
    })

    const result = await anthropicResolver({ apiKey: 'key' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(result.success, false)
    assert.match(result.success ? '' : (result.error ?? ''), /No result from Anthropic/)
  })

  test('rejects an image whose base64 payload would exceed the provider ceiling', async () => {
    // The API limit is measured on the base64 payload, which is ~4/3 the raw
    // size. Guarding the raw bytes against 10 MB would let an 8 MB image
    // through to be rejected by the provider after paying for the download.
    const recorded = stubFetch({ bytes: Buffer.alloc(8 * 1024 * 1024) })

    const result = await anthropicResolver({ apiKey: 'key' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(result.success, false)
    assert.match(result.success ? '' : (result.error ?? ''), /limit/)
    assert.equal(recorded.length, 0, 'the provider must not be called for an oversized image')
  })

  test('sends the image bytes with their media type instead of the URL', async () => {
    const recorded = stubFetch({ message: textMessage(enResult) })

    const result = await anthropicResolver({ apiKey: 'key' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    const content = (recorded[0]!.body.messages as { content: Record<string, any>[] }[])[0]!.content
    const imageBlock = content[0]!

    assert.equal(imageBlock.type, 'image')
    assert.equal(imageBlock.source.type, 'base64')
    assert.equal(imageBlock.source.media_type, 'image/jpeg')
    assert.doesNotMatch(JSON.stringify(recorded[0]!.body), /example\.test/)
    assert.equal(result.success, true)
  })

  test('sends the instructions as the system prompt, not as a message', async () => {
    const recorded = stubFetch({ message: textMessage(enResult) })

    await anthropicResolver({
      apiKey: 'key',
      instructions: ({ defaultInstructions }) =>
        `${defaultInstructions}\n\nKeep it under 12 words.`,
    }).resolve({ imageThumbnailUrl: IMAGE_URL, locale: 'en', req })

    assert.match(recorded[0]!.body.system as string, /Keep it under 12 words\./)
    assert.equal(
      (recorded[0]!.body.messages as { role: string }[]).every((m) => m.role === 'user'),
      true,
    )
    assert.equal(recorded[0]!.headers['x-api-key'], 'key')
    assert.equal(recorded[0]!.headers['anthropic-version'], '2023-06-01')
  })

  test('omits effort unless configured, so a model that rejects it stays usable', async () => {
    // `claude-haiku-4-5` reads images but 400s on `output_config.effort`. The
    // API treats an omitted effort as `high`, so the field is only worth sending
    // when the project asked for a specific level.
    const recorded = stubFetch({ message: textMessage(enResult) })

    await anthropicResolver({ apiKey: 'key', model: 'claude-haiku-4-5' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal('effort' in (recorded[0]!.body.output_config as object), false)
  })

  test('sends the configured effort level', async () => {
    const recorded = stubFetch({ message: textMessage(enResult) })

    await anthropicResolver({ apiKey: 'key', effort: 'low' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal((recorded[0]!.body.output_config as { effort?: string }).effort, 'low')
  })

  test('asks for every locale in a single request', async () => {
    const recorded = stubFetch({
      message: textMessage({
        de: { altText: 'Ein Kamel vor Palmen.', keywords: ['Kamel'] },
        ...enResult,
      }),
    })

    const result = await anthropicResolver({ apiKey: 'key' }).resolveBulk({
      imageThumbnailUrl: IMAGE_URL,
      locales: ['de', 'en'],
      req,
    })

    assert.equal(recorded.length, 1)
    assert.deepEqual(
      (
        recorded[0]!.body.output_config as {
          format: { schema: { required: string[] }; type: string }
        }
      ).format.schema.required,
      ['de', 'en'],
    )
    assert.equal(result.success, true)
  })

  test('reports a refusal rather than a JSON parse failure', async () => {
    stubFetch({ message: { content: [{ type: 'text', text: '' }], stop_reason: 'refusal' } })

    const result = await anthropicResolver({ apiKey: 'key' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(result.success, false)
    assert.match(result.success ? '' : (result.error ?? ''), /declined/)
  })

  test('reports a truncated answer rather than a JSON parse failure', async () => {
    stubFetch({
      message: {
        content: [{ type: 'text', text: '{"en": {"altText": "A ca' }],
        stop_reason: 'max_tokens',
      },
    })

    const result = await anthropicResolver({ apiKey: 'key' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(result.success, false)
    assert.match(result.success ? '' : (result.error ?? ''), /ran out of tokens/)
  })

  test('reports the format when the thumbnail is served as something Claude cannot read', async () => {
    // An upload collection may hold SVG or AVIF, and `getImageThumbnail` falls
    // back to the original when no derivative exists. Naming the format beats a
    // provider-side error that says nothing about which file was at fault.
    const recorded = stubFetch({ contentType: 'image/svg+xml' })

    const result = await anthropicResolver({ apiKey: 'key' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(result.success, false)
    assert.match(result.success ? '' : (result.error ?? ''), /svg/)
    assert.equal(recorded.length, 0, 'the provider must not be called for an unreadable format')
  })
})
