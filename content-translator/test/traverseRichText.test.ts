import type { SanitizedConfig } from 'payload'

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { ValueToTranslate } from '../src/translate/types.ts'

import { traverseRichText } from '../src/translate/traverseRichText.ts'

const payloadConfig = {} as SanitizedConfig

const collect = (root: Record<string, unknown>) => {
  const valuesToTranslate: ValueToTranslate[] = []

  traverseRichText({
    emptyOnly: false,
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

  test('keeps each segment under its own marker even when the words are reordered', () => {
    // German -> English moves the verb; the model may emit markers out of
    // textual order. The segment for marker N must still land in node N.
    const nodes = [{ text: 'Ich ' }, { bold: true, text: 'gehe' }, { text: ' nach Hause' }]
    const root = { children: nodes }

    const values = collect(root)
    // "I go home" with the bold span ("go") moved before "home".
    values[0].onTranslate('⟦0⟧I ⟦1⟧go ⟦2⟧home')

    assert.equal(nodes[0].text, 'I ')
    assert.equal(nodes[1].text, 'go ')
    assert.equal(nodes[2].text, 'home')
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
