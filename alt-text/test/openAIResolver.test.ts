import assert from 'node:assert/strict'

import { afterEach, describe, test } from 'vitest'

import type { PayloadRequest } from 'payload'

import { openAIResolver } from '../src/resolvers/openAI.ts'

/**
 * The resolver speaks the chat-completions API over `fetch` rather than through
 * the OpenAI SDK, so the request it builds is its own responsibility: the
 * endpoint it posts to, the bearer header, the schema-constrained response
 * format, and — the point of this resolver — that the thumbnail travels as a URL
 * for OpenAI to fetch rather than as inlined bytes.
 */

const IMAGE_URL = 'https://example.test/photo-600x400.jpg'

const req = {
  payload: { logger: { error() {}, info() {}, warn() {} } },
} as unknown as PayloadRequest

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

const enResult = { en: { altText: 'A camel in front of palm trees.', keywords: ['camel'] } }

const completion = (payload: unknown, finishReason = 'stop') => ({
  choices: [{ finish_reason: finishReason, message: { content: JSON.stringify(payload) } }],
})

type Recorded = { body: Record<string, unknown>; headers: Record<string, string>; url: string }

/** Answers each call with the next queued response, recording what was sent. */
function stubFetch(responses: { body?: unknown; status?: number }[]): Recorded[] {
  const recorded: Recorded[] = []
  let call = 0

  globalThis.fetch = (async (
    url: string,
    init?: { body?: string; headers?: Record<string, string> },
  ) => {
    const response = responses[Math.min(call, responses.length - 1)]!
    call += 1

    recorded.push({ body: JSON.parse(init?.body ?? '{}'), headers: init?.headers ?? {}, url })

    const status = response.status ?? 200

    return {
      json: async () => response.body,
      ok: status < 400,
      status,
      text: async () => JSON.stringify(response.body ?? 'error body'),
    }
  }) as unknown as typeof fetch

  return recorded
}

describe('openAI resolver', () => {
  test('hands OpenAI the thumbnail URL instead of downloading the image', async () => {
    const recorded = stubFetch([{ body: completion(enResult) }])

    const result = await openAIResolver({ apiKey: 'key' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    // One call only: the resolver must not fetch the image itself.
    assert.equal(recorded.length, 1)
    assert.equal(recorded[0]!.url, 'https://api.openai.com/v1/chat/completions')
    assert.equal(recorded[0]!.headers.Authorization, 'Bearer key')

    const content = (
      recorded[0]!.body.messages as { content: { image_url?: { url: string } }[] }[]
    )[1]!.content

    assert.equal(content[0]!.image_url?.url, IMAGE_URL)
    assert.equal(result.success, true)
  })

  test('posts to the configured base URL, for an OpenAI-compatible provider', async () => {
    const recorded = stubFetch([{ body: completion(enResult) }])

    await openAIResolver({ apiKey: 'key', baseUrl: 'https://provider.test/v1' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(recorded[0]!.url, 'https://provider.test/v1/chat/completions')
  })

  test('constrains the response to a schema covering every requested locale', async () => {
    const recorded = stubFetch([
      {
        body: completion({
          de: { altText: 'Ein Kamel vor Palmen.', keywords: ['Kamel'] },
          ...enResult,
        }),
      },
    ])

    const result = await openAIResolver({ apiKey: 'key' }).resolveBulk({
      imageThumbnailUrl: IMAGE_URL,
      locales: ['de', 'en'],
      req,
    })

    const format = recorded[0]!.body.response_format as {
      json_schema: { schema: { required: string[] }; strict: boolean }
      type: string
    }

    assert.equal(format.type, 'json_schema')
    assert.equal(format.json_schema.strict, true)
    assert.deepEqual(format.json_schema.schema.required, ['de', 'en'])
    assert.equal(recorded.length, 1)
    assert.equal(result.success, true)
  })

  test('sends the instructions as the system message, separately from the image', async () => {
    const recorded = stubFetch([{ body: completion(enResult) }])

    await openAIResolver({
      apiKey: 'key',
      instructions: ({ defaultInstructions }) =>
        `${defaultInstructions}\n\nKeep it under 12 words.`,
    }).resolve({ imageThumbnailUrl: IMAGE_URL, locale: 'en', req })

    const messages = recorded[0]!.body.messages as { content: unknown; role: string }[]

    assert.equal(messages[0]!.role, 'system')
    assert.match(messages[0]!.content as string, /Keep it under 12 words\./)
  })

  test('reports a truncated answer rather than a JSON parse failure', async () => {
    stubFetch([
      {
        body: {
          choices: [{ finish_reason: 'length', message: { content: '{"en": {"altText": "A ca' } }],
        },
      },
    ])

    const result = await openAIResolver({ apiKey: 'key' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(result.success, false)
    assert.match(result.success ? '' : (result.error ?? ''), /ran out of tokens/)
  })

  test('reports the status when the provider rejects the request', async () => {
    stubFetch([{ body: { error: 'bad request' }, status: 400 }])

    const result = await openAIResolver({ apiKey: 'key' }).resolve({
      imageThumbnailUrl: IMAGE_URL,
      locale: 'en',
      req,
    })

    assert.equal(result.success, false)
    assert.match(result.success ? '' : (result.error ?? ''), /400/)
  })

  test('building the resolver without an API key does not throw', () => {
    // A common setup wires the plugin as `enabled: !!process.env.OPENAI_API_KEY`
    // with `resolver: openAIResolver({ apiKey: process.env.OPENAI_API_KEY! })`.
    // The resolver argument is evaluated whether or not the plugin is enabled,
    // so a missing key must not fail the whole Payload config at load time — it
    // is reported when a generation is actually requested.
    assert.doesNotThrow(() => openAIResolver({ apiKey: undefined as unknown as string }))
  })
})
