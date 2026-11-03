import type { PayloadRequest } from 'payload'

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { translateOperation } from '../src/translate/operation.ts'

const paragraph = (text: string) => ({ type: 'paragraph', children: [{ text }] })

const richText = (...children: unknown[]) => ({ root: { children } })

const block = (fields: Record<string, unknown>) => ({ type: 'block', fields })

const germanDoc = {
  id: 'page-1',
  body: richText(
    paragraph('Fliesstext'),
    block({
      blockType: 'columns',
      buttonLabel: 'Knopf',
      columns: [{ text: 'Spalte eins' }, { text: 'Spalte zwei' }],
      note: richText(paragraph('Hinweis')),
    }),
  ),
}

const blocks = [
  {
    slug: 'columns',
    fields: [
      { name: 'buttonLabel', type: 'text', localized: true },
      {
        name: 'columns',
        type: 'array',
        fields: [{ name: 'text', type: 'text', localized: true }],
      },
      { name: 'note', type: 'richText', localized: true },
    ],
  },
  {
    slug: 'localizedRows',
    fields: [
      {
        name: 'rows',
        type: 'array',
        // Payload strips `localized` from fields nested in a localized parent.
        fields: [
          { name: 'text', type: 'text' },
          { name: 'note', type: 'richText' },
        ],
        localized: true,
      },
      {
        name: 'sections',
        type: 'blocks',
        blocks: [{ slug: 'section', fields: [{ name: 'text', type: 'text' }] }],
        localized: true,
      },
    ],
  },
]

/** Saves a German page into English; only the data layer and the LLM are stubbed. */
const translateToEnglish = async ({
  emptyOnly = true,
  english = { id: 'page-1' },
  extraBlocks = [],
  german = germanDoc,
}: {
  emptyOnly?: boolean
  english?: Record<string, unknown>
  extraBlocks?: unknown[]
  german?: Record<string, unknown>
}) => {
  const saved: Record<string, unknown>[] = []
  const docsByLocale: Record<string, unknown> = { de: german, en: english }

  const req = {
    payload: {
      config: {
        blocks: [...blocks, ...extraBlocks],
        collections: [
          { slug: 'pages', fields: [{ name: 'body', type: 'richText', localized: true }] },
        ],
        custom: {
          translator: {
            resolver: {
              key: 'stub',
              resolve: ({ texts }: { texts: string[] }) => ({
                success: true,
                translatedTexts: texts.map((text) => `en:${text}`),
              }),
            },
          },
        },
      },
      findByID: ({ locale }: { locale: string }) => structuredClone(docsByLocale[locale]),
      logger: { warn: () => {} },
      update: ({ data }: { data: Record<string, unknown> }) => saved.push(data),
    },
  } as unknown as PayloadRequest

  await translateOperation({
    id: 'page-1',
    collectionSlug: 'pages',
    emptyOnly,
    locale: 'en',
    localeFrom: 'de',
    req,
    update: true,
  })

  return saved[0]
}

describe('translating only empty fields of a page with rich text blocks', () => {
  test('translates the fields inside a block when the target rich text is empty', async () => {
    const saved = await translateToEnglish({})

    assert.deepEqual(
      saved.body,
      richText(
        paragraph('en:Fliesstext'),
        block({
          blockType: 'columns',
          buttonLabel: 'en:Knopf',
          columns: [{ text: 'en:Spalte eins' }, { text: 'en:Spalte zwei' }],
          note: richText(paragraph('en:Hinweis')),
        }),
      ),
    )
  })

  test('keeps a target rich text that is already filled, blocks included', async () => {
    const english = richText(block({ blockType: 'columns', buttonLabel: 'Existing button' }))

    const saved = await translateToEnglish({ english: { id: 'page-1', body: english } })

    assert.deepEqual(saved.body, english)
  })
})

describe('translating localized arrays and blocks nested in a rich text block', () => {
  const germanRows = {
    id: 'page-1',
    body: richText(
      block({
        blockType: 'localizedRows',
        rows: [{ id: 'row-1', note: richText(paragraph('Zeilenhinweis')), text: 'Zeile' }],
        sections: [{ id: 'section-1', blockType: 'section', text: 'Abschnitt' }],
      }),
    ),
  }

  for (const emptyOnly of [true, false]) {
    test(`keeps and translates their content when emptyOnly is ${emptyOnly}`, async () => {
      const saved = await translateToEnglish({ emptyOnly, german: germanRows })

      const { fields } = (saved.body as ReturnType<typeof richText>).root.children[0] as {
        fields: {
          rows: { note: unknown; text: string }[]
          sections: { blockType: string; text: string }[]
        }
      }

      assert.equal(fields.rows[0].text, 'en:Zeile')
      assert.deepEqual(fields.rows[0].note, richText(paragraph('en:Zeilenhinweis')))
      assert.equal(fields.sections[0].blockType, 'section')
      assert.equal(fields.sections[0].text, 'en:Abschnitt')
    })
  }
})

describe('beforeTranslate on a field inside a rich text block', () => {
  test('receives the source and target locale', async () => {
    const received: unknown[] = []

    await translateToEnglish({
      extraBlocks: [
        {
          slug: 'hooked',
          fields: [
            {
              name: 'label',
              type: 'text',
              custom: {
                'content-translator': {
                  beforeTranslate: ({
                    localeFrom,
                    localeTo,
                    value,
                  }: {
                    localeFrom: string
                    localeTo: string
                    value: string
                  }) => {
                    received.push({ localeFrom, localeTo })
                    return value
                  },
                },
              },
              localized: true,
            },
          ],
        },
      ],
      german: { id: 'page-1', body: richText(block({ blockType: 'hooked', label: 'Etikett' })) },
    })

    assert.deepEqual(received, [{ localeFrom: 'de', localeTo: 'en' }])
  })
})
