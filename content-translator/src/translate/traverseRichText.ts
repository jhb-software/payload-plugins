import type { FlattenedBlock, SanitizedConfig } from 'payload'

import type { IncrementalAccumulator, TranslateMode, ValueToTranslate } from './types.js'

import { traverseFields } from './traverseFields.js'

// Markers delimit the individual text nodes inside a single block-level element
// (paragraph, heading, list item, quote, ...) so the element can be translated
// as ONE unit. This lets the translator reorder words across nodes — required
// for languages like German -> English where the verb moves — while each
// formatting span (bold, italic, ...) still receives its own translated text.
// Translating each text node in isolation made the model merge adjacent
// sentence fragments and shift content (and formatting) into the wrong nodes.
const MARKER_OPEN = '⟦'
const MARKER_CLOSE = '⟧'
const buildMarker = (i: number) => `${MARKER_OPEN}${i}${MARKER_CLOSE}`
const markerRegex = /⟦(\d+)⟧/g

// Translate a maximal run of consecutive text-node siblings. A single node is
// sent as plain text (no markers). Two or more nodes are joined into one
// marker-delimited value and split back apart once translated.
const pushTextRun = (run: Record<string, any>[], valuesToTranslate: ValueToTranslate[]) => {
  if (run.length === 1) {
    const node = run[0]

    if (!node.text) {
      return
    }

    valuesToTranslate.push({
      onTranslate: (translated) => {
        node.text = translated
      },
      value: node.text,
    })

    return
  }

  let combined = ''
  run.forEach((node, index) => {
    combined += buildMarker(index) + node.text
  })

  valuesToTranslate.push({
    onTranslate: (translated: string) => {
      const matches: { end: number; index: number; start: number }[] = []
      let match: null | RegExpExecArray
      markerRegex.lastIndex = 0

      while ((match = markerRegex.exec(translated)) !== null) {
        matches.push({
          end: markerRegex.lastIndex,
          index: parseInt(match[1], 10),
          start: match.index,
        })
      }

      if (matches.length === 0) {
        // No markers survived translation - keep the originals rather than
        // writing the whole translated blob into the first node.
        return
      }

      // Each segment is the text following its marker up to the next marker
      // in textual order, so reordering across markers is handled correctly.
      const segments: Record<number, string> = {}
      for (let m = 0; m < matches.length; m++) {
        const current = matches[m]
        const next = matches[m + 1]
        segments[current.index] = translated.slice(
          current.end,
          next ? next.start : translated.length,
        )
      }

      run.forEach((node, index) => {
        if (typeof segments[index] === 'string') {
          node.text = segments[index]
        }
      })
    },
    value: combined,
  })
}

export const traverseRichText = ({
  incremental,
  localeFrom,
  mode,
  payloadConfig,
  root,
  siblingData,
  translatedData,
  valuesToTranslate,
}: {
  incremental?: IncrementalAccumulator
  localeFrom: string
  mode: TranslateMode
  payloadConfig: SanitizedConfig
  root: Record<string, unknown>
  siblingData?: Record<string, unknown>
  translatedData: Record<string, unknown>
  valuesToTranslate: ValueToTranslate[]
}) => {
  siblingData = siblingData ?? root

  if (siblingData.type === 'block') {
    if (
      'fields' in siblingData &&
      siblingData.fields &&
      typeof siblingData.fields === 'object' &&
      'blockType' in siblingData.fields &&
      typeof siblingData.fields.blockType === 'string' &&
      siblingData.fields.blockType
    ) {
      const blockData = siblingData.fields as Record<string, unknown>
      const blockName = siblingData.fields.blockType

      const blockConfig = findBlockConfigBySlug(blockName, payloadConfig)

      if (blockConfig) {
        // Traverse the fields of the block
        traverseFields({
          dataFrom: root,
          fields: blockConfig.fields,
          incremental,
          localeFrom,
          localizedParent: false,
          mode,
          payloadConfig,
          siblingDataFrom: blockData,
          siblingDataTranslated: blockData,
          translatedData,
          valuesToTranslate,
        })
      }
    } else {
      console.warn('Could not find fields and blockType in block', siblingData)
    }

    return
  }

  if (!Array.isArray(siblingData?.children)) {
    return
  }

  const children = siblingData.children as Record<string, any>[]
  let i = 0

  while (i < children.length) {
    const child = children[i]

    if (child && typeof child.text === 'string') {
      // Gather a maximal run of consecutive text nodes and translate them
      // together so a sentence split across formatting spans stays aligned.
      const run: Record<string, any>[] = []

      while (i < children.length && children[i] && typeof children[i].text === 'string') {
        run.push(children[i])
        i++
      }

      pushTextRun(run, valuesToTranslate)
    } else {
      traverseRichText({
        incremental,
        localeFrom,
        mode,
        payloadConfig,
        root,
        siblingData: child,
        translatedData,
        valuesToTranslate,
      })

      i++
    }
  }
}

const findBlockConfigBySlug = (
  slug: string,
  payloadConfig: SanitizedConfig,
): FlattenedBlock | undefined => {
  const payloadBlockConfig = payloadConfig.blocks?.find((block) => block.slug === slug)
  if (payloadBlockConfig) {
    return payloadBlockConfig
  }

  // If not found anywhere, warn and return undefined
  console.warn(
    `Could not find block config for lexical block with slug ${slug} in the Payload config blocks array. The content translator plugin only supports blocks defined in the Payload config blocks array.`,
  )

  // In Payload v4, the option for defining block configs inside of fields will be removed in favor of the
  // global blocks array in the payload config. Therefore this function only supports the global blocks array.
  // See https://github.com/payloadcms/payload/pull/10905

  return undefined
}
