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
  test('keeps a sentence with a link together as one value', () => {
    const root = {
      children: [
        { text: 'The ' },
        { children: [{ text: 'Garden Route' }], type: 'link' },
        { text: ' is scenic.' },
      ],
    }

    const values = collect(root)

    assert.equal(values.length, 1)
    assert.equal(values[0].value, '⟦0⟧The ⟦1⟧Garden Route⟦2⟧ is scenic.')
  })

  test('moves links with their words when the translation swaps them', () => {
    const capeTown = {
      children: [{ text: 'Kapstadt' }],
      fields: { url: 'https://cape.example' },
      type: 'link',
    }
    const windhoek = {
      children: [{ text: 'Windhoek' }],
      fields: { url: 'https://windhoek.example' },
      type: 'link',
    }
    const root = { children: [capeTown, { text: ' und ' }, windhoek, { text: ' sind schoen.' }] }

    collect(root)[0].onTranslate('⟦2⟧Windhoek⟦1⟧ and ⟦0⟧Cape Town⟦3⟧ are nice.')

    assert.deepEqual(root.children, [
      { ...windhoek, children: [{ text: 'Windhoek' }] },
      { text: ' and ' },
      { ...capeTown, children: [{ text: 'Cape Town' }] },
      { text: ' are nice.' },
    ])
  })

  test('moves formatted text with its words when the translation reorders it', () => {
    const root = {
      children: [{ text: 'Ich ' }, { bold: true, text: 'gehe' }, { text: ' heim' }],
    }

    collect(root)[0].onTranslate('⟦2⟧Home ⟦1⟧go ⟦0⟧I')

    assert.deepEqual(root.children, [{ text: 'Home ' }, { bold: true, text: 'go ' }, { text: 'I' }])
  })

  test('leaves empty text nodes in place when the translation reorders the others', () => {
    const empty = { text: '' }
    const root = { children: [{ text: 'A' }, empty, { bold: true, text: 'B' }] }

    collect(root)[0].onTranslate('⟦1⟧b⟦0⟧a')

    assert.deepEqual(root.children, [{ bold: true, text: 'b' }, empty, { text: 'a' }])
  })

  test('reorders the text nodes inside a link with their words', () => {
    const link = { children: [{ text: 'die ' }, { bold: true, text: 'Route' }], type: 'link' }
    const root = { children: [{ text: 'Siehe ' }, link] }

    collect(root)[0].onTranslate('⟦0⟧See ⟦2⟧route ⟦1⟧the')

    assert.deepEqual(link.children, [{ bold: true, text: 'route ' }, { text: 'the' }])
  })

  test('keeps the source when words reorder inside a link holding nested elements', () => {
    const first = { text: 'die ' }
    const second = { text: 'Route' }
    const link = { children: [first, { children: [second], type: 'mark' }], type: 'link' }
    const root = { children: [{ text: 'Siehe ' }, link] }

    collect(root)[0].onTranslate('⟦0⟧See ⟦2⟧route ⟦1⟧the')

    assert.equal(first.text, 'die ')
    assert.equal(second.text, 'Route')
  })

  test('accepts a text node left empty when its link still has text', () => {
    const link = {
      children: [{ bold: true, text: 'a' }, { text: ' ' }, { bold: true, text: 'b' }],
      type: 'link',
    }
    const root = { children: [link] }

    collect(root)[0].onTranslate('⟦0⟧x y⟦1⟧⟦2⟧')

    assert.deepEqual(link.children, [
      { bold: true, text: 'x y' },
      { text: '' },
      { bold: true, text: '' },
    ])
  })

  test('keeps runs in the same parent apart when an earlier run adds a node', () => {
    const url = { children: [{ text: 'https://example.com' }], type: 'autolink' }
    const lineBreak = { type: 'linebreak' }
    const root = {
      children: [{ text: 'Auf ' }, url, lineBreak, { text: 'A' }, { bold: true, text: 'B' }],
    }

    const values = collect(root)
    values[0].onTranslate('⟦0⟧On ⟦url:1⟧ now')
    values[1].onTranslate('⟦1⟧b⟦0⟧a')

    assert.deepEqual(root.children, [
      { text: 'On ' },
      url,
      { detail: 0, format: 0, mode: 'normal', style: '', text: ' now', type: 'text', version: 1 },
      lineBreak,
      { bold: true, text: 'b' },
      { text: 'a' },
    ])
  })

  test('keeps the source when the translation tears a link apart', () => {
    const link = { children: [{ text: 'die ' }, { bold: true, text: 'Route' }], type: 'link' }
    const after = { text: ' hier' }
    const root = { children: [link, after] }

    collect(root)[0].onTranslate('⟦0⟧the ⟦2⟧here ⟦1⟧route')

    assert.deepEqual(root.children, [link, after])
    assert.equal(link.children[0].text, 'die ')
  })

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
    'a marker for an unknown node': '⟦0⟧I saw ⟦1⟧the route⟦7⟧.',
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
})

describe('traverseRichText - autolinks', () => {
  const autolink = (url = 'https://example.com') => ({
    children: [{ text: url }],
    fields: { url },
    type: 'autolink',
  })

  test('never sends the URL to the translator', () => {
    const root = {
      children: [{ text: 'Siehe ' }, autolink('https://x.io?a=1&copy=2'), { text: ' jetzt' }],
    }

    assert.equal(collect(root)[0].value, '⟦0⟧Siehe ⟦url:1⟧⟦2⟧ jetzt')
  })

  test('sends nothing for a paragraph that only holds autolinks and whitespace', () => {
    assert.equal(collect({ children: [autolink(), { text: ' ' }, autolink()] }).length, 0)
  })

  test('accepts a URL marker whose letters the model capitalized', () => {
    const url = autolink()
    const root = { children: [{ text: 'Siehe ' }, url] }

    collect(root)[0].onTranslate('⟦0⟧See ⟦URL:1⟧')

    assert.deepEqual(root.children, [{ text: 'See ' }, url])
  })

  test('leaves the run unchanged when a resolver echoes its value', () => {
    const url = autolink()
    const before = { text: 'Siehe ' }
    const after = { text: ' jetzt' }
    const root = { children: [before, url, after] }

    const values = collect(root)
    values[0].onTranslate(values[0].value)

    assert.deepEqual(root.children, [{ text: 'Siehe ' }, url, { text: ' jetzt' }])
  })

  test('translates the sentence around it and moves it with the translation', () => {
    const url = autolink()
    const root = { children: [{ text: 'Unter ' }, url, { text: ' steht es' }] }

    collect(root)[0].onTranslate('⟦2⟧It is at ⟦0⟧⟦url:1⟧')

    assert.deepEqual(root.children, [{ text: 'It is at ' }, { text: '' }, url])
    assert.equal(url.children[0].text, 'https://example.com')
  })

  test('adds a text node for words the translation places after a final autolink', () => {
    const url = autolink()
    const root = { children: [{ format: 1, style: 'color: red', text: 'Schau auf ' }, url] }

    collect(root)[0].onTranslate('⟦0⟧Look at ⟦url:1⟧ now')

    assert.deepEqual(root.children, [
      { format: 1, style: 'color: red', text: 'Look at ' },
      url,
      {
        detail: 0,
        format: 1,
        mode: 'normal',
        style: 'color: red',
        text: ' now',
        type: 'text',
        version: 1,
      },
    ])
  })

  test('adds a plain text node even when the words in front are a tab', () => {
    const url = autolink()
    const root = {
      children: [{ text: 'Siehe' }, { detail: 2, text: '\t', type: 'tab' }, url],
    }

    collect(root)[0].onTranslate('⟦0⟧See⟦1⟧\t⟦url:2⟧ now')

    assert.equal((root.children[3] as { type: string }).type, 'text')
    assert.equal((root.children[3] as { text: string }).text, ' now')
  })

  test('keeps the source when a translation turns a text marker into a URL marker', () => {
    const before = { text: 'Siehe ' }
    const after = { text: ' jetzt' }
    const url = autolink()
    const root = { children: [before, url, after] }

    collect(root)[0].onTranslate('⟦url:0⟧See ⟦url:1⟧⟦2⟧ now')

    assert.deepEqual(root.children, [{ text: 'Siehe ' }, url, { text: ' jetzt' }])
  })
})
