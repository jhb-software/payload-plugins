import type { FlattenedBlock, PayloadRequest, SanitizedConfig } from 'payload'

import type { ValueToTranslate } from './types.js'

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

type RichTextNode = Record<string, unknown>

const isTextNode = (node: RichTextNode | undefined): boolean => typeof node?.text === 'string'

// Links wrap part of a sentence, so they must not split it into separate values.
const isLinkNode = (node: RichTextNode | undefined): boolean =>
  node?.type === 'link' || node?.type === 'autolink'

const isInlineNode = (node: RichTextNode | undefined): boolean =>
  isTextNode(node) || isLinkNode(node)

/** A text node of a run, with the type of the link wrapping it (if any). */
type RunEntry = { linkType?: unknown; node: RichTextNode }

const collectRunEntries = (node: RichTextNode, linkType?: unknown): RunEntry[] => {
  if (isTextNode(node)) {
    return [{ linkType, node }]
  }

  const nodeLinkType = linkType ?? node?.type

  return Array.isArray(node?.children)
    ? (node.children as RichTextNode[]).flatMap((child) => collectRunEntries(child, nodeLinkType))
    : []
}

// Nodes keep their position in the document, so a usable translation has every
// marker exactly once, in ascending order, with nothing in front of the first.
const splitByMarkers = (translated: string, count: number): string[] | undefined => {
  const matches = [...translated.matchAll(markerRegex)]
  const isIntact =
    matches.length === count &&
    matches.every((match, index) => match[1] === String(index)) &&
    !translated.slice(0, matches[0].index).trim()

  return isIntact
    ? matches.map((match, index) =>
        translated.slice(match.index + match[0].length, matches[index + 1]?.index),
      )
    : undefined
}

// Autolink text must stay the URL it links to, and a link without text vanishes.
const fitsNode = ({ linkType, node }: RunEntry, segment: string): boolean => {
  if (linkType === 'autolink') {
    return segment === node.text
  }

  return linkType !== 'link' || segment.trim().length > 0
}

// Translate a maximal run of inline text nodes. A single node is sent as plain
// text (no markers). Two or more nodes are joined into one marker-delimited
// value and split back apart once translated. A damaged translation keeps the
// source text of the whole run, which is visible to editors, rather than writing
// text into the wrong nodes.
const pushTextRun = (
  run: RunEntry[],
  valuesToTranslate: ValueToTranslate[],
  req?: PayloadRequest,
) => {
  const entries = run.filter(({ node }) => node.text)

  if (entries.length === 0) {
    return
  }

  if (entries.length === 1) {
    const { node } = entries[0]

    valuesToTranslate.push({
      onTranslate: (translated) => {
        node.text = translated
      },
      value: node.text,
    })

    return
  }

  valuesToTranslate.push({
    onTranslate: (translated) => {
      if (typeof translated !== 'string') {
        return
      }

      const segments = splitByMarkers(translated, entries.length)

      if (!segments?.every((segment, index) => fitsNode(entries[index], segment))) {
        req?.payload.logger.warn(
          { translated },
          'Keeping the source text of a rich text segment: the translation damaged its markers or links.',
        )

        return
      }

      entries.forEach(({ node }, index) => {
        node.text = segments[index]
      })
    },
    value: entries.map(({ node }, index) => buildMarker(index) + String(node.text)).join(''),
  })
}

export const traverseRichText = ({
  localeFrom,
  localeTo,
  payloadConfig,
  req,
  root,
  siblingData,
  translatedData,
  valuesToTranslate,
}: {
  localeFrom?: string
  localeTo?: string
  payloadConfig: SanitizedConfig
  req?: PayloadRequest
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

      const blockConfig = findBlockConfigBySlug(blockName, payloadConfig, req)

      if (blockConfig) {
        // Block data is both source and target here, so its fields always look
        // filled. The caller has already decided this rich text gets translated,
        // which makes emptyOnly meaningless below this point.
        traverseFields({
          dataFrom: root,
          emptyOnly: false,
          fields: blockConfig.fields,
          localeFrom,
          localeTo,
          localizedParent: false,
          payloadConfig,
          req,
          siblingDataFrom: blockData,
          siblingDataTranslated: blockData,
          translatedData,
          valuesToTranslate,
        })
      }
    } else {
      req?.payload.logger.warn(
        { block: siblingData },
        'Could not find fields and blockType in block',
      )
    }

    return
  }

  if (!Array.isArray(siblingData?.children)) {
    return
  }

  const children = siblingData.children as RichTextNode[]
  let i = 0

  while (i < children.length) {
    const child = children[i]

    if (isInlineNode(child)) {
      // Gather a maximal run of inline nodes and translate them together so a
      // sentence split across formatting spans or links stays aligned.
      const run: RunEntry[] = []

      while (i < children.length && isInlineNode(children[i])) {
        run.push(...collectRunEntries(children[i]))
        i++
      }

      pushTextRun(run, valuesToTranslate, req)
    } else {
      traverseRichText({
        localeFrom,
        localeTo,
        payloadConfig,
        req,
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
  req?: PayloadRequest,
): FlattenedBlock | undefined => {
  const payloadBlockConfig = payloadConfig.blocks?.find((block) => block.slug === slug)
  if (payloadBlockConfig) {
    return payloadBlockConfig
  }

  // If not found anywhere, warn and return undefined
  req?.payload.logger.warn(
    `Could not find block config for lexical block with slug ${slug} in the Payload config blocks array. The content translator plugin only supports blocks defined in the Payload config blocks array.`,
  )

  // In Payload v4, the option for defining block configs inside of fields will be removed in favor of the
  // global blocks array in the payload config. Therefore this function only supports the global blocks array.
  // See https://github.com/payloadcms/payload/pull/10905

  return undefined
}
