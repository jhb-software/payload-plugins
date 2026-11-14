import type { PayloadRequest } from 'payload'

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { translateOperation } from '../src/translate/operation.ts'

const GOOD = '⟦0⟧Good ⟦1⟧link'
const DAMAGED = 'Good link without markers'

const german = {
  id: 'page-1',
  body: {
    root: {
      children: [
        {
          type: 'paragraph',
          children: [{ text: 'Guter ' }, { type: 'link', children: [{ text: 'Link' }] }],
        },
        { type: 'paragraph', children: [{ text: 'Absatz' }] },
      ],
    },
  },
}

type Resolve = (args: {
  attempt: number
  texts: string[]
}) => { success: false } | { success: true; translatedTexts: string[] }

/** Translates a German page into English; only the data layer and the LLM are stubbed. */
const translate = async (resolve: Resolve) => {
  const requests: string[][] = []
  const warnings: unknown[][] = []
  const saved: { body?: typeof german.body }[] = []

  const req = {
    payload: {
      config: {
        collections: [
          { slug: 'pages', fields: [{ name: 'body', type: 'richText', localized: true }] },
        ],
        custom: {
          translator: {
            resolver: {
              key: 'stub',
              resolve: ({ texts }: { texts: string[] }) => {
                requests.push(texts)

                return resolve({ attempt: requests.length, texts })
              },
            },
          },
        },
      },
      findByID: ({ locale }: { locale: string }) =>
        structuredClone(locale === 'de' ? german : { id: 'page-1' }),
      logger: { warn: (...args: unknown[]) => warnings.push(args) },
      update: ({ data }: { data: { body?: typeof german.body } }) => saved.push(data),
    },
  } as unknown as PayloadRequest

  const result = await translateOperation({
    id: 'page-1',
    collectionSlug: 'pages',
    locale: 'en',
    localeFrom: 'de',
    req,
    update: true,
  })

  const [linkParagraph, plainParagraph] = saved[0].body!.root.children
  const [text, link] = linkParagraph.children as [
    { text: string },
    { children: { text: string }[] },
  ]

  return {
    linkSentence: `${text.text}${link.children[0].text}`,
    plainText: (plainParagraph.children[0] as { text: string }).text,
    requests,
    result,
    warnings,
  }
}

const damagedFirst: Resolve = ({ attempt, texts }) => ({
  success: true,
  translatedTexts: attempt === 1 ? [DAMAGED, 'Paragraph'] : texts.map(() => GOOD),
})

describe('translating a value whose markers come back damaged', () => {
  test('asks once more for only the damaged value and writes the second answer', async () => {
    const { linkSentence, plainText, requests, result, warnings } = await translate(damagedFirst)

    assert.deepEqual(requests[1], [requests[0][0]])
    assert.equal(linkSentence, 'Good link')
    assert.equal(plainText, 'Paragraph')
    assert.equal(result.success && result.untranslatedSegments, 0)
    assert.deepEqual(warnings, [])
  })

  test('sends no second request when every value was accepted', async () => {
    const { requests, result } = await translate(({ texts }) => ({
      success: true,
      translatedTexts: texts.map((text) => (text.includes('⟦') ? GOOD : 'Paragraph')),
    }))

    assert.equal(requests.length, 1)
    assert.equal(result.success && result.untranslatedSegments, 0)
  })

  test('stops after one retry, keeps the source text and reports the count', async () => {
    const { linkSentence, plainText, requests, result } = await translate(({ texts }) => ({
      success: true,
      translatedTexts: texts.map((text) => (text.includes('⟦') ? DAMAGED : 'Paragraph')),
    }))

    assert.equal(requests.length, 2)
    assert.equal(linkSentence, 'Guter Link')
    assert.equal(plainText, 'Paragraph')
    assert.equal(result.success && result.untranslatedSegments, 1)
  })

  test('logs which document kept its source text', async () => {
    const { warnings } = await translate(({ texts }) => ({
      success: true,
      translatedTexts: texts.map(() => DAMAGED),
    }))

    assert.equal(warnings.length, 1)
    assert.deepEqual(
      {
        collectionSlug: (warnings[0][0] as Record<string, unknown>).collectionSlug,
        id: (warnings[0][0] as Record<string, unknown>).id,
        locale: (warnings[0][0] as Record<string, unknown>).locale,
      },
      { id: 'page-1', collectionSlug: 'pages', locale: 'en' },
    )
  })

  const failedRetries: Record<string, Resolve> = {
    'reports a failure': ({ attempt }) =>
      attempt === 1
        ? { success: true, translatedTexts: [DAMAGED, 'Paragraph'] }
        : { success: false },
    'returns the wrong number of texts': ({ attempt }) => ({
      success: true,
      translatedTexts: attempt === 1 ? [DAMAGED, 'Paragraph'] : [GOOD, GOOD],
    }),
    throws: ({ attempt }) => {
      if (attempt > 1) {
        throw new Error('rate limited')
      }

      return { success: true, translatedTexts: [DAMAGED, 'Paragraph'] }
    },
  }

  for (const [failure, resolve] of Object.entries(failedRetries)) {
    test(`keeps the accepted translations when the retry ${failure}`, async () => {
      const { linkSentence, plainText, result } = await translate(resolve)

      assert.equal(linkSentence, 'Guter Link')
      assert.equal(plainText, 'Paragraph')
      assert.equal(result.success && result.untranslatedSegments, 1)
    })
  }
})
