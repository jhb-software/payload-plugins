import type { PayloadRequest } from 'payload'

import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'

import { anthropicResolver } from '../src/resolvers/anthropic.ts'

/**
 * The Messages API differs from the OpenAI-compatible shape in ways that fail
 * only against the real provider: the instructions travel as the top-level
 * `system` parameter rather than as a message, and the required response shape
 * goes in `output_config.format` rather than being asked for in the prompt.
 *
 * That schema is what lets this resolver drop the response format instruction
 * the OpenAI one needs, so it is pinned: it must require one string per input
 * index, or a merged or dropped entry would come back as a valid response and
 * every later value would land in the wrong field.
 *
 * A refusal and a truncated answer both arrive as HTTP 200 with content the
 * plugin cannot use; without naming them an editor sees a JSON parse error.
 */

const originalFetch = globalThis.fetch

/**
 * `createPromptResolver` swallows a failed generation into `{ success: false }`
 * and logs why, so the reason a translation failed is only observable through
 * the logger.
 */
const recordingReq = () => {
  const errors: string[] = []
  const logger = {
    error: (entry: { originalErr?: string }) => {
      if (entry?.originalErr) {
        errors.push(entry.originalErr)
      }
    },
    info() {},
    warn() {},
  }

  return { errors, req: { payload: { logger } } as unknown as PayloadRequest }
}

/** Discards what it records; the tests that assert on the reason build their own. */
const silentReq = recordingReq().req

type Recorded = { body: Record<string, any>; headers: Record<string, string>; url: string }

const stubFetch = (message: unknown, status = 200): Recorded[] => {
  const recorded: Recorded[] = []

  globalThis.fetch = async (url, init) => {
    recorded.push({
      body: JSON.parse(String(init?.body)),
      headers: (init?.headers ?? {}) as Record<string, string>,
      url: String(url),
    })

    return new Response(JSON.stringify(message), { status })
  }

  return recorded
}

const textMessage = (translations: unknown) => ({
  content: [{ type: 'text', text: JSON.stringify(translations) }],
  stop_reason: 'end_turn',
})

/**
 * `JSON.stringify` reorders integer-like keys into ascending order, so an object
 * fixture cannot express an out-of-order response. Only a raw body can.
 */
const rawTextMessage = (json: string) => ({
  content: [{ type: 'text', text: json }],
  stop_reason: 'end_turn',
})

const translate = (
  resolver: ReturnType<typeof anthropicResolver>,
  texts: string[],
  on: PayloadRequest = silentReq,
) => resolver.resolve({ localeFrom: 'en', localeTo: 'de', req: on, texts })

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('anthropicResolver', () => {
  test('sends the instructions as the system prompt and the texts as the user message', async () => {
    const recorded = stubFetch(textMessage({ 0: 'eins' }))

    await translate(
      anthropicResolver({
        apiKey: 'test',
        instructions: ({ defaultInstructions }) =>
          `${defaultInstructions}\n\nNever translate the brand name "Acme".`,
      }),
      ['one'],
    )

    assert.equal(recorded[0]!.url, 'https://api.anthropic.com/v1/messages')
    assert.match(recorded[0]!.body.system, /Never translate the brand name "Acme"\./)
    assert.match(recorded[0]!.body.system, /segment markers/)
    assert.deepEqual(JSON.parse(recorded[0]!.body.messages[0].content), { 0: 'one' })
    assert.equal(recorded[0]!.headers['x-api-key'], 'test')
    assert.equal(recorded[0]!.headers['anthropic-version'], '2023-06-01')
  })

  test('requires one translation per input index through the response schema', async () => {
    const recorded = stubFetch(textMessage({ 0: 'eins', 1: 'zwei' }))

    await translate(anthropicResolver({ apiKey: 'test' }), ['one', 'two'])

    const schema = recorded[0]!.body.output_config.format.schema

    assert.equal(recorded[0]!.body.output_config.format.type, 'json_schema')
    assert.deepEqual(schema.required, ['0', '1'])
    assert.equal(schema.additionalProperties, false)
    assert.deepEqual(Object.keys(schema.properties), ['0', '1'])
  })

  test('rebuilds translations in input order from an out-of-order response', async () => {
    stubFetch(rawTextMessage('{"1": "zwei", "0": "eins"}'))

    const result = await translate(anthropicResolver({ apiKey: 'test' }), ['one', 'two'])

    assert.deepEqual(result.success && result.translatedTexts, ['eins', 'zwei'])
  })

  test('sends the fields the Messages API requires', async () => {
    // max_tokens is required on POST /v1/messages, and the model decides what
    // the request costs. Dropping either 400s or silently re-prices every
    // request while a suite that only inspects the prompt stays green.
    const recorded = stubFetch(textMessage({ 0: 'eins' }))

    await translate(anthropicResolver({ apiKey: 'test' }), ['one'])

    assert.equal(recorded[0]!.body.model, 'claude-opus-5')
    assert.equal(typeof recorded[0]!.body.max_tokens, 'number')
    assert.ok(recorded[0]!.body.max_tokens > 0)
  })

  test('omits effort unless configured, so a model that rejects it stays usable', async () => {
    // `claude-haiku-4-5` translates fine but 400s on `output_config.effort`.
    // The API treats an omitted effort as `high`, so the field is only worth
    // sending when the project asked for a specific level.
    const recorded = stubFetch(textMessage({ 0: 'eins' }))

    await translate(anthropicResolver({ apiKey: 'test', model: 'claude-haiku-4-5' }), ['one'])

    assert.equal('effort' in recorded[0]!.body.output_config, false)
  })

  test('sends the configured effort level', async () => {
    const recorded = stubFetch(textMessage({ 0: 'eins' }))

    await translate(anthropicResolver({ apiKey: 'test', effort: 'low' }), ['one'])

    assert.equal(recorded[0]!.body.output_config.effort, 'low')
  })

  test('scales the token budget with the chunk length', async () => {
    // A chunk that grows without its budget growing gets truncated, and because
    // every chunk is awaited together one truncated chunk fails the whole
    // document - so the two options must not be settable independently.
    const small = stubFetch(textMessage({ 0: 'eins' }))
    await translate(anthropicResolver({ apiKey: 'test', chunkLength: 10 }), ['one'])

    const large = stubFetch(textMessage({ 0: 'eins' }))
    await translate(anthropicResolver({ apiKey: 'test', chunkLength: 200 }), ['one'])

    assert.ok(
      (large[0]!.body.max_tokens as number) > (small[0]!.body.max_tokens as number),
      'a larger chunkLength must raise the default budget',
    )
  })

  test('sends each chunk its own request and concatenates the results in order', async () => {
    const recorded: Record<string, any>[] = []
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      recorded.push(body)
      const index = recorded.length - 1

      return new Response(JSON.stringify(textMessage({ 0: index === 0 ? 'eins' : 'zwei' })), {
        status: 200,
      })
    }

    const result = await translate(anthropicResolver({ apiKey: 'test', chunkLength: 1 }), [
      'one',
      'two',
    ])

    assert.equal(recorded.length, 2)
    assert.deepEqual(result.success && result.translatedTexts, ['eins', 'zwei'])
  })

  test('reports the status when the provider rejects the request', async () => {
    stubFetch({ type: 'error' }, 429)
    const { errors, req: recording } = recordingReq()

    const result = await translate(anthropicResolver({ apiKey: 'test' }), ['one'], recording)

    assert.equal(result.success, false)
    assert.match(errors[0] ?? '', /429/)
  })

  test('reports a response carrying no text block', async () => {
    stubFetch({ content: [{ type: 'thinking', thinking: '' }], stop_reason: 'end_turn' })
    const { errors, req: recording } = recordingReq()

    const result = await translate(anthropicResolver({ apiKey: 'test' }), ['one'], recording)

    assert.equal(result.success, false)
    assert.match(errors[0] ?? '', /Missing content/)
  })

  test('reads the JSON past the thinking blocks Claude emits before it', async () => {
    // Thinking is on by default on the default model, so the text block is not
    // content[0]. Indexing rather than searching would fail against the real
    // API while this suite stayed green.
    stubFetch({
      content: [
        { type: 'thinking', thinking: '' },
        { type: 'text', text: '{"0": "eins"}' },
      ],
      stop_reason: 'end_turn',
    })

    const result = await translate(anthropicResolver({ apiKey: 'test' }), ['one'])

    assert.deepEqual(result.success && result.translatedTexts, ['eins'])
  })

  test('reports a refusal rather than a JSON parse failure', async () => {
    stubFetch({ content: [{ type: 'text', text: '' }], stop_reason: 'refusal' })
    const { errors, req: recording } = recordingReq()

    const result = await translate(anthropicResolver({ apiKey: 'test' }), ['one'], recording)

    assert.equal(result.success, false)
    assert.deepEqual(errors, ['Claude declined to translate this content'])
  })

  test('reports a truncated answer rather than a JSON parse failure', async () => {
    stubFetch({ content: [{ type: 'text', text: '{"0": "ei' }], stop_reason: 'max_tokens' })
    const { errors, req: recording } = recordingReq()

    const result = await translate(anthropicResolver({ apiKey: 'test' }), ['one'], recording)

    assert.equal(result.success, false)
    assert.match(errors[0] ?? '', /ran out of tokens/)
  })
})
