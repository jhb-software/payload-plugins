import type { Field, SanitizedConfig } from 'payload'

import { createHeadlessEditor } from '@lexical/headless'
import {
  defaultEditorConfig,
  getEnabledNodes,
  sanitizeServerEditorConfig,
} from '@payloadcms/richtext-lexical'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { IncrementalAccumulator, ValueToTranslate } from '../src/translate/types.ts'

import { traverseFields } from '../src/translate/traverseFields.ts'

const payloadConfig = {} as SanitizedConfig

const contentFields: Field[] = [{ name: 'content', type: 'richText', localized: true }]

type LexNode = Record<string, any>

const lex = (children: LexNode[]) => ({
  root: { type: 'root', children, direction: 'ltr', format: '', indent: 0, version: 1 },
})

const para = (text: null | string, extra: LexNode = {}): LexNode => ({
  type: 'paragraph',
  children:
    text === null
      ? []
      : [{ type: 'text', detail: 0, format: 0, mode: 'normal', style: '', text, version: 1 }],
  direction: 'ltr',
  format: '',
  indent: 0,
  version: 1,
  ...extra,
})

const paraText = (node: LexNode): string =>
  Array.isArray(node?.children)
    ? node.children.map((c: LexNode) => (typeof c.text === 'string' ? c.text : '')).join('')
    : ''

/**
 * Run a traverse pass, apply the mock translation to every collected value,
 * then run the deferred hash stamps — exactly as the operation does.
 */
const runPass = (
  mode: 'all' | 'empty' | 'incremental',
  dataFrom: Record<string, unknown>,
  translatedData: Record<string, unknown>,
  localeFrom = 'en',
) => {
  const valuesToTranslate: ValueToTranslate[] = []
  const incremental: IncrementalAccumulator = { conflictCount: 0, stamps: [] }

  traverseFields({
    dataFrom,
    fields: contentFields,
    incremental,
    localeFrom,
    mode,
    payloadConfig,
    translatedData,
    valuesToTranslate,
  })

  const translatedValues = valuesToTranslate.map((v) => v.value)
  for (const v of valuesToTranslate) {
    v.onTranslate(`TRANSLATED:${v.value}`)
  }
  for (const stamp of incremental.stamps) {
    stamp()
  }

  return { conflictCount: incremental.conflictCount, translatedData, translatedValues }
}

/** Produce a fully translated + stamped target tree from a source tree (initial "all" run). */
const initialTranslate = (sourceChildren: LexNode[], localeFrom = 'en') => {
  const dataFrom = { content: lex(sourceChildren) }
  const translatedData: Record<string, unknown> = {}
  runPass('all', dataFrom, translatedData, localeFrom)
  return translatedData as { content: ReturnType<typeof lex> }
}

const targetChildren = (translatedData: { content: ReturnType<typeof lex> }): LexNode[] =>
  translatedData.content.root.children

describe('incremental richText translation', () => {
  test('appended source paragraph is translated and inserted; existing paragraphs are not retranslated', () => {
    const target = initialTranslate([para('Alpha'), para('Beta')])
    const before = targetChildren(target).map(paraText)

    const result = runPass(
      'incremental',
      { content: lex([para('Alpha'), para('Beta'), para('Gamma')]) },
      target,
    )

    assert.deepEqual(result.translatedValues, ['Gamma'])
    const after = targetChildren(target).map(paraText)
    assert.deepEqual(after, [before[0], before[1], 'TRANSLATED:Gamma'])
  })

  test('a paragraph inserted in the middle lands in the correct position, not appended at the end', () => {
    const target = initialTranslate([para('One'), para('Three')])

    const result = runPass(
      'incremental',
      { content: lex([para('One'), para('Two'), para('Three')]) },
      target,
    )

    assert.deepEqual(result.translatedValues, ['Two'])
    assert.deepEqual(targetChildren(target).map(paraText), [
      'TRANSLATED:One',
      'TRANSLATED:Two',
      'TRANSLATED:Three',
    ])
  })

  test('editing a source paragraph retranslates only that paragraph', () => {
    const target = initialTranslate([para('One'), para('Two'), para('Three')])

    const result = runPass(
      'incremental',
      { content: lex([para('One'), para('Two changed'), para('Three')]) },
      target,
    )

    assert.deepEqual(result.translatedValues, ['Two changed'])
    assert.deepEqual(targetChildren(target).map(paraText), [
      'TRANSLATED:One',
      'TRANSLATED:Two changed',
      'TRANSLATED:Three',
    ])
  })

  test('a manually edited translation is preserved when its source is unchanged', () => {
    const target = initialTranslate([para('Keep me')])
    // human edits the translation in the admin panel
    targetChildren(target)[0].children[0].text = 'Hand tuned translation'

    const result = runPass('incremental', { content: lex([para('Keep me')]) }, target)

    assert.deepEqual(result.translatedValues, [])
    assert.equal(paraText(targetChildren(target)[0]), 'Hand tuned translation')
  })

  test('when source changes under a hand-edited translation, the translation is left in place and counted as needing review', () => {
    const target = initialTranslate([para('Original source')])
    targetChildren(target)[0].children[0].text = 'Hand tuned translation'

    const result = runPass('incremental', { content: lex([para('Edited source')]) }, target)

    assert.deepEqual(result.translatedValues, [])
    assert.equal(result.conflictCount, 1)
    assert.equal(paraText(targetChildren(target)[0]), 'Hand tuned translation')
  })

  test('a source paragraph deleted in the source is removed from the translation', () => {
    const target = initialTranslate([para('Stay'), para('Go away')])

    runPass('incremental', { content: lex([para('Stay')]) }, target)

    assert.deepEqual(targetChildren(target).map(paraText), ['TRANSLATED:Stay'])
  })

  test('a paragraph unchanged in one source locale is still reused after translating from a different source locale', () => {
    // Target first translated from EN, stamping a per-EN source hash.
    const target = initialTranslate([para('Hello world')], 'en')

    // Then translated from DE (different source text) — retranslates and stamps a per-DE hash.
    runPass('incremental', { content: lex([para('Hallo Welt')]) }, target, 'de')

    // Re-running from EN with the EN source unchanged must reuse, not retranslate,
    // because the per-locale srcHash for EN survived the DE run.
    const result = runPass('incremental', { content: lex([para('Hello world')]) }, target, 'en')

    assert.deepEqual(result.translatedValues, [])
  })

  test('incremental from an empty target translates everything', () => {
    const target: Record<string, unknown> = {}

    const result = runPass('incremental', { content: lex([para('First'), para('Second')]) }, target)

    assert.deepEqual(result.translatedValues, ['First', 'Second'])
    assert.deepEqual(targetChildren(target as any).map(paraText), [
      'TRANSLATED:First',
      'TRANSLATED:Second',
    ])
  })
})

describe('incremental richText storage', () => {
  // This is a regression guard on a third-party assumption: the incremental
  // merge stores its hashes in Lexical's NodeState ($) slot, which only works
  // because Payload's default lexical config round-trips unknown $ keys
  // untouched. If a future @payloadcms/richtext-lexical drops them, this fails
  // and the inline-storage strategy must be reconsidered (see the sidecar
  // fallback in the README).
  test('NodeState hashes survive a headless-editor round-trip with the default Payload lexical config', async () => {
    const sanitized = await sanitizeServerEditorConfig(defaultEditorConfig, {
      collections: [],
      i18n: {},
    } as unknown as SanitizedConfig)
    const nodes = getEnabledNodes({ editorConfig: sanitized as any })
    const editor = createHeadlessEditor({ nodes })

    const nodeState = { 'translator-plugin': { outHash: 'def456', srcHash: { en: 'abc123' } } }

    const editorState = editor.parseEditorState(lex([para('Hallo Welt', { $: nodeState })]) as any)
    const roundTripped: any = editorState.toJSON()

    assert.deepEqual(roundTripped.root.children[0].$, nodeState)
  })
})
