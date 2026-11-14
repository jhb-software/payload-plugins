import type { PayloadRequest } from 'payload'

import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'

import { mistralResolver } from '../src/resolvers/mistral.ts'

/**
 * Mistral serves OpenAI's chat completions shape, so the resolver's whole job is
 * to point at the right host with the right model default. That is what is
 * pinned here: a wrong host or a leaked `gpt-*` default would surface only as a
 * provider error in production. Everything downstream of the request — chunking,
 * the instructions, index-keyed reconstruction — belongs to
 * `createPromptResolver` and is covered through the OpenAI resolver.
 */

const originalFetch = globalThis.fetch

const noopLogger = { error() {}, info() {}, warn() {} }
const req = { payload: { logger: noopLogger } } as unknown as PayloadRequest

type Recorded = {
  body: { messages: { content: string; role: string }[]; model: string }
  url: string
}

const stubFetch = (translations: unknown): Recorded[] => {
  const recorded: Recorded[] = []

  globalThis.fetch = async (url, init) => {
    recorded.push({ body: JSON.parse(String(init?.body)), url: String(url) })

    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({ translations }) } }] }),
      { status: 200 },
    )
  }

  return recorded
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('mistralResolver', () => {
  test('sends the chunk to the Mistral API with a Mistral model', async () => {
    const recorded = stubFetch({ 0: 'eins' })

    await mistralResolver({ apiKey: 'test' }).resolve({
      localeFrom: 'en',
      localeTo: 'de',
      req,
      texts: ['one'],
    })

    assert.equal(recorded[0]!.url, 'https://api.mistral.ai/v1/chat/completions')
    assert.equal(recorded[0]!.body.model, 'mistral-medium-latest')
    assert.deepEqual(JSON.parse(recorded[0]!.body.messages[1]!.content), { 0: 'one' })
  })
})
