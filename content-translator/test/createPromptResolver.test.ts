import type { PayloadRequest } from 'payload'

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type {
  TranslateGenerateArgs,
  TranslateInstructions,
} from '../src/resolvers/createPromptResolver.ts'

import { createPromptResolver } from '../src/resolvers/createPromptResolver.ts'

// The resolver only reads req.payload.logger; the rest of PayloadRequest is a
// framework boundary that is deliberately stubbed rather than constructed.
const noopLogger = { error() {}, info() {}, warn() {} }
const req = { payload: { logger: noopLogger } } as unknown as PayloadRequest

/** Records what the provider was asked to generate and replies with `translations`. */
const recordingResolver = ({
  chunkLength,
  instructions,
  responseFormatInstruction,
  translations = (texts) => Object.fromEntries(texts.map((text, i) => [String(i), `${text}!`])),
}: {
  chunkLength?: number
  instructions?: TranslateInstructions
  responseFormatInstruction?: string
  translations?: (texts: string[]) => unknown
}) => {
  const calls: TranslateGenerateArgs[] = []

  const resolver = createPromptResolver({
    chunkLength,
    generate: (args) => {
      calls.push(args)

      return translations(args.texts) as Record<string, unknown>
    },
    instructions,
    key: 'test',
    responseFormatInstruction,
  })

  return { calls, resolver }
}

const translate = (resolver: ReturnType<typeof createPromptResolver>, texts: string[]) =>
  resolver.resolve({ localeFrom: 'en', localeTo: 'de', req, texts })

describe('createPromptResolver - instructions and input', () => {
  test('states the rules the plugin depends on without embedding the texts', async () => {
    const { calls, resolver } = recordingResolver({})

    await translate(resolver, ['Northern Light setup'])

    const { instructions } = calls[0]!
    // Segment markers survive rich text only if the model is told about them.
    assert.match(instructions, /⟦0⟧/)
    assert.match(instructions, /Translate each value independently/)
    // The content to translate travels separately from the instructions.
    assert.doesNotMatch(instructions, /Northern Light/)
  })

  test('sends the texts as an index-keyed JSON object', async () => {
    const { calls, resolver } = recordingResolver({})

    await translate(resolver, ['one', 'two'])

    assert.deepEqual(JSON.parse(calls[0]!.input), { 0: 'one', 1: 'two' })
  })

  test('still sends the texts when the instructions are replaced entirely', async () => {
    const { calls, resolver } = recordingResolver({ instructions: () => 'Translate everything.' })

    await translate(resolver, ['one'])

    assert.equal(calls[0]!.instructions, 'Translate everything.')
    assert.deepEqual(JSON.parse(calls[0]!.input), { 0: 'one' })
  })

  test('omits response format instructions unless the provider asks for them', async () => {
    const { calls, resolver } = recordingResolver({})

    await translate(resolver, ['one'])

    assert.doesNotMatch(calls[0]!.instructions, /valid JSON object/)
  })

  test('includes the provider response format instructions when configured', async () => {
    const { calls, resolver } = recordingResolver({
      responseFormatInstruction: 'Return ONLY a valid JSON object.',
    })

    await translate(resolver, ['one'])

    assert.match(calls[0]!.instructions, /Return ONLY a valid JSON object\./)
  })

  test('keeps the response format instructions when the instructions are replaced', async () => {
    // Without this, replacing the instructions would break the contract between
    // the resolver and its provider, e.g. OpenAI's JSON mode.
    const { calls, resolver } = recordingResolver({
      instructions: () => 'Translate everything.',
      responseFormatInstruction: 'Return ONLY a valid JSON object.',
    })

    await translate(resolver, ['one'])

    assert.equal(
      calls[0]!.instructions,
      'Translate everything.\n\nReturn ONLY a valid JSON object.',
    )
  })

  test('passes the locales lowercased as ISO 639 codes', async () => {
    const { calls, resolver } = recordingResolver({})

    await resolver.resolve({ localeFrom: 'EN', localeTo: 'DE', req, texts: ['one'] })

    assert.equal(calls[0]!.localeFrom, 'en')
    assert.equal(calls[0]!.localeTo, 'de')
    assert.match(calls[0]!.instructions, /"de"/)
  })
})

describe('createPromptResolver - customizing the instructions', () => {
  test('sends the extended instructions built from the default ones', async () => {
    const { calls, resolver } = recordingResolver({
      instructions: ({ defaultInstructions }) =>
        `${defaultInstructions}\n\nNever translate "Acme".`,
    })

    await translate(resolver, ['one'])

    assert.match(calls[0]!.instructions, /Never translate "Acme"\./)
    assert.match(calls[0]!.instructions, /Translate each value independently/)
  })

  test('awaits async instructions before generating', async () => {
    const { calls, resolver } = recordingResolver({
      instructions: async ({ defaultInstructions }) => {
        await Promise.resolve()

        return `${defaultInstructions}\n\nLoaded terms.`
      },
    })

    const result = await translate(resolver, ['one'])

    assert.match(calls[0]!.instructions, /Loaded terms\./)
    assert.deepEqual(result.success && result.translatedTexts, ['one!'])
  })

  test('builds the instructions once per translation, not once per chunk', async () => {
    let built = 0
    const { calls, resolver } = recordingResolver({
      chunkLength: 1,
      instructions: ({ defaultInstructions }) => {
        built++

        return `${defaultInstructions}\n\nKeep "Acme".`
      },
    })

    await translate(resolver, ['one', 'two', 'three'])

    assert.equal(built, 1)
    // Every chunk is still sent the same instructions.
    assert.equal(calls.length, 3)
    assert.ok(calls.every(({ instructions }) => /Keep "Acme"\./.test(instructions)))
  })
})

describe('createPromptResolver - chunking', () => {
  test('generates once per chunk and joins the chunks back in input order', async () => {
    const { calls, resolver } = recordingResolver({ chunkLength: 2 })

    const result = await translate(resolver, ['one', 'two', 'three'])

    assert.equal(calls.length, 2)
    assert.deepEqual(calls[0]!.texts, ['one', 'two'])
    assert.deepEqual(calls[1]!.texts, ['three'])
    // Each chunk is keyed from 0, matching the object it is asked to return.
    assert.deepEqual(JSON.parse(calls[1]!.input), { 0: 'three' })
    assert.deepEqual(result.success && result.translatedTexts, ['one!', 'two!', 'three!'])
  })
})

describe('createPromptResolver - response reconstruction', () => {
  test('reorders out-of-order keys back to the input order', async () => {
    const { resolver } = recordingResolver({
      translations: () => ({ 1: 'zwei', 0: 'eins' }),
    })

    const result = await translate(resolver, ['one', 'two'])

    assert.deepEqual(result.success && result.translatedTexts, ['eins', 'zwei'])
  })

  test('keeps the original text for a missing key instead of shifting later values', async () => {
    const { resolver } = recordingResolver({
      translations: () => ({ 0: 'eins', 2: 'drei' }),
    })

    const result = await translate(resolver, ['one', 'two', 'three'])

    assert.deepEqual(result.success && result.translatedTexts, ['eins', 'two', 'drei'])
  })

  test('tolerates an array of translations', async () => {
    const { resolver } = recordingResolver({ translations: () => ['eins', 'zwei'] })

    const result = await translate(resolver, ['one', 'two'])

    assert.deepEqual(result.success && result.translatedTexts, ['eins', 'zwei'])
  })

  test('rejects a bare string rather than indexing it character by character', async () => {
    const { resolver } = recordingResolver({ translations: () => 'einszwei' })

    const result = await translate(resolver, ['one', 'two'])

    assert.equal(result.success, false)
  })

  test('fails the translation when the provider throws instead of propagating the error', async () => {
    const resolver = createPromptResolver({
      generate: () => {
        throw new Error('provider is down')
      },
      key: 'test',
    })

    const result = await translate(resolver, ['one'])

    assert.equal(result.success, false)
  })
})
