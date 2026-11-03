import type { SanitizedConfig } from 'payload'

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { ValueToTranslate } from '../src/translate/types.ts'

import { traverseRichText } from '../src/translate/traverseRichText.ts'

const payloadConfig = {} as SanitizedConfig

const collect = (root: Record<string, unknown>) => {
  const valuesToTranslate: ValueToTranslate[] = []

  traverseRichText({
    payloadConfig,
    root,
    translatedData: {},
    valuesToTranslate,
  })

  return valuesToTranslate
}

describe('traverseRichText - text runs', () => {
  test('sends a lone text node as plain text without markers', () => {
    const node = { text: 'Hello' }
    const root = { children: [node] }

    const values = collect(root)

    assert.equal(values.length, 1)
    assert.equal(values[0].value, 'Hello')
    assert.ok(!values[0].value.includes('⟦'))

    values[0].onTranslate('Hallo')
    assert.equal(node.text, 'Hallo')
  })

  test('joins consecutive text nodes into one marker-delimited value', () => {
    const root = {
      children: [{ text: 'Hello ' }, { bold: true, text: 'brave' }, { text: ' world' }],
    }

    const values = collect(root)

    assert.equal(values.length, 1)
    assert.equal(values[0].value, '⟦0⟧Hello ⟦1⟧brave⟦2⟧ world')
  })

  test('splits a translated run back into its nodes by marker', () => {
    const nodes = [{ text: 'Hello ' }, { bold: true, text: 'brave' }, { text: ' world' }]
    const root = { children: nodes }

    const values = collect(root)
    values[0].onTranslate('⟦0⟧Hallo ⟦1⟧tapfere ⟦2⟧Welt')

    assert.equal(nodes[0].text, 'Hallo ')
    assert.equal(nodes[1].text, 'tapfere ')
    assert.equal(nodes[2].text, 'Welt')
  })

  test('accepts a segment left empty because its words moved to another node', () => {
    const nodes = [{ text: 'Ich ' }, { bold: true, text: 'gehe' }, { text: ' heim' }]
    const root = { children: nodes }

    collect(root)[0].onTranslate('⟦0⟧I ⟦1⟧go home⟦2⟧')

    assert.equal(nodes[0].text, 'I ')
    assert.equal(nodes[1].text, 'go home')
    assert.equal(nodes[2].text, '')
  })

  test('does not send empty text nodes to the translator', () => {
    const nodes = [{ text: '' }, { bold: true, text: 'Hello' }, { text: ' world' }]

    const values = collect({ children: nodes })

    assert.equal(values[0].value, '⟦0⟧Hello⟦1⟧ world')
    values[0].onTranslate('⟦0⟧Hallo⟦1⟧ Welt')
    assert.deepEqual(
      nodes.map((node) => node.text),
      ['', 'Hallo', ' Welt'],
    )
  })

  test('keeps the original node texts when no markers survive translation', () => {
    const nodes = [{ text: 'Hello ' }, { bold: true, text: 'world' }]
    const root = { children: nodes }

    const values = collect(root)
    values[0].onTranslate('Hallo Welt')

    assert.equal(nodes[0].text, 'Hello ')
    assert.equal(nodes[1].text, 'world')
  })

  test('recurses into nested element children', () => {
    const listItem = { text: 'Item one' }
    const root = {
      children: [{ children: [listItem], type: 'listitem' }],
    }

    const values = collect(root)

    assert.equal(values.length, 1)
    assert.equal(values[0].value, 'Item one')
  })
})

describe('traverseRichText - links', () => {
  for (const type of ['link', 'autolink']) {
    test(`keeps a sentence with an ${type} together as one value`, () => {
      const root = {
        children: [
          { text: 'The ' },
          { children: [{ text: 'Garden Route' }], type },
          { text: ' is scenic.' },
        ],
      }

      const values = collect(root)

      assert.equal(values.length, 1)
      assert.equal(values[0].value, '⟦0⟧The ⟦1⟧Garden Route⟦2⟧ is scenic.')
    })
  }

  test('lets words move across a link while the link keeps its target', () => {
    const before = { text: 'Ich habe ' }
    const linked = { text: 'die Route' }
    const after = { text: ' gesehen.' }
    const link = { children: [linked], fields: { url: 'https://example.com' }, type: 'link' }
    const root = { children: [before, link, after] }

    collect(root)[0].onTranslate('⟦0⟧I saw ⟦1⟧the route⟦2⟧.')

    assert.equal(before.text, 'I saw ')
    assert.equal(linked.text, 'the route')
    assert.equal(after.text, '.')
    assert.deepEqual(link.fields, { url: 'https://example.com' })
  })

  test('keeps formatting spans inside a link as their own segments', () => {
    const root = {
      children: [
        { text: 'See ' },
        { children: [{ text: 'the ' }, { bold: true, text: 'route' }], type: 'link' },
      ],
    }

    assert.equal(collect(root)[0].value, '⟦0⟧See ⟦1⟧the ⟦2⟧route')
  })

  test('sends a paragraph that is only a link as plain text', () => {
    const linked = { text: 'Garden Route' }
    const root = { children: [{ children: [linked], type: 'link' }] }

    const values = collect(root)

    assert.equal(values[0].value, 'Garden Route')
    values[0].onTranslate('Gartenroute')
    assert.equal(linked.text, 'Gartenroute')
  })

  test('sends nothing for a link without text', () => {
    const root = { children: [{ children: [], type: 'link' }] }

    assert.equal(collect(root).length, 0)
  })

  test('translates text nested in another element inside a link', () => {
    const marked = { text: 'the route' }
    const root = {
      children: [
        { text: 'See ' },
        { children: [{ children: [marked], type: 'mark' }], type: 'link' },
      ],
    }

    const values = collect(root)

    assert.equal(values[0].value, '⟦0⟧See ⟦1⟧the route')
    values[0].onTranslate('⟦0⟧Siehe ⟦1⟧die Route')
    assert.equal(marked.text, 'die Route')
  })

  const damagedOutputs = {
    'a duplicated marker': '⟦0⟧I saw ⟦1⟧the ⟦1⟧route⟦2⟧.',
    'an empty link': '⟦0⟧I saw the route⟦1⟧⟦2⟧.',
    'a lost marker': '⟦0⟧I saw the route⟦2⟧.',
    'markers out of order': '⟦0⟧I ⟦2⟧saw ⟦1⟧the route.',
    'text before the first marker': 'Well, ⟦0⟧I saw ⟦1⟧the route⟦2⟧.',
  }

  for (const [damage, translated] of Object.entries(damagedOutputs)) {
    test(`keeps the source sentence when the translation has ${damage}`, () => {
      const nodes = [{ text: 'Ich habe ' }, { text: 'die Route' }, { text: ' gesehen.' }]
      const root = { children: [nodes[0], { children: [nodes[1]], type: 'link' }, nodes[2]] }

      collect(root)[0].onTranslate(translated)

      assert.deepEqual(
        nodes.map((node) => node.text),
        ['Ich habe ', 'die Route', ' gesehen.'],
      )
    })
  }

  test('keeps the source sentence when a translation alters the text of an autolink', () => {
    const nodes = [{ text: 'Besuche ' }, { text: 'https://example.com' }, { text: ' jetzt' }]
    const root = { children: [nodes[0], { children: [nodes[1]], type: 'autolink' }, nodes[2]] }

    collect(root)[0].onTranslate('⟦0⟧Visit ⟦1⟧https://example.com now⟦2⟧')

    assert.deepEqual(
      nodes.map((node) => node.text),
      ['Besuche ', 'https://example.com', ' jetzt'],
    )
  })

  test('translates around an autolink whose text stays the same', () => {
    const nodes = [{ text: 'Besuche ' }, { text: 'https://example.com' }, { text: ' jetzt' }]
    const root = { children: [nodes[0], { children: [nodes[1]], type: 'autolink' }, nodes[2]] }

    collect(root)[0].onTranslate('⟦0⟧Visit ⟦1⟧https://example.com⟦2⟧ now')

    assert.deepEqual(
      nodes.map((node) => node.text),
      ['Visit ', 'https://example.com', ' now'],
    )
  })
})
