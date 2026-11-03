import type { FlattenedBlock, PayloadRequest, SanitizedConfig } from 'payload'

import type { ValueToTranslate } from './types.js'

import { traverseFields } from './traverseFields.js'

// Markers delimit the individual text nodes inside a single block-level element
// (paragraph, heading, list item, quote, ...) so the element can be translated
// as ONE unit. This lets the translator reorder words across nodes — required
// for languages like German -> English where the verb moves — while each
// formatting span (bold, italic, ...) and link still receives its own translated
// text. Translating each text node in isolation made the model merge adjacent
// sentence fragments and shift content (and formatting) into the wrong nodes.
// Autolinks get a marker of their own without text: their text is the URL, which
// must never change, and the marker only records where the URL sits.
const markerRegex = /⟦(url:)?(\d+)⟧/gi

type RichTextNode = Record<string, unknown>

/** A marked part of a run. `item` is the sibling that moves when words reorder. */
type RunEntry =
  | { item: RichTextNode; kind: 'autolink' }
  | { item: RichTextNode; kind: 'link' | 'text'; node: RichTextNode }

type Token = { entry: RunEntry; index: number; segment: string }

const isTextNode = (node: RichTextNode | undefined): boolean => typeof node?.text === 'string'

// Links wrap part of a sentence, so they must not split it into separate values.
const isInlineNode = (node: RichTextNode | undefined): boolean =>
  isTextNode(node) || node?.type === 'link' || node?.type === 'autolink'

const collectTextNodes = (node: RichTextNode): RichTextNode[] => {
  if (isTextNode(node)) {
    return [node]
  }

  return Array.isArray(node?.children)
    ? (node.children as RichTextNode[]).flatMap(collectTextNodes)
    : []
}

const collectRunEntries = (item: RichTextNode): RunEntry[] => {
  if (item.type === 'autolink') {
    return [{ item, kind: 'autolink' }]
  }

  const kind = isTextNode(item) ? 'text' : 'link'

  return collectTextNodes(item).map((node) => ({ item, kind, node }))
}

const toMarkedValue = (entry: RunEntry, index: number): string =>
  entry.kind === 'autolink' ? `⟦url:${index}⟧` : `⟦${index}⟧${String(entry.node.text)}`

/** Text nodes can only swap places when they all share the link as their parent. */
const hasOnlyTextChildren = (item: RichTextNode): boolean =>
  Array.isArray(item.children) && (item.children as RichTextNode[]).every(isTextNode)

// The text nodes of one link can only move as a whole.
const keepsLinksTogether = (tokens: Token[]): boolean => {
  const seenItems = new Set<RichTextNode>()

  return tokens.every(({ entry, index }, position) => {
    const previous = tokens[position - 1]

    if (previous?.entry.item === entry.item) {
      return index > previous.index || hasOnlyTextChildren(entry.item)
    }

    const isFirstVisit = !seenItems.has(entry.item)
    seenItems.add(entry.item)

    return isFirstVisit
  })
}

// A link without any text vanishes from the document.
const keepsLinkText = (tokens: Token[]): boolean =>
  tokens.every(
    ({ entry }) =>
      entry.kind !== 'link' ||
      tokens.some((token) => token.entry.item === entry.item && token.segment.trim()),
  )

// A usable translation has every marker exactly once, with nothing in front of
// the first, and leaves every link whole and with text.
const parseTokens = (translated: string, entries: RunEntry[]): Token[] | undefined => {
  const matches = [...translated.matchAll(markerRegex)]

  if (matches.length !== entries.length || translated.slice(0, matches[0].index).trim()) {
    return undefined
  }

  const tokens = matches.map((match, position) => ({
    entry: entries[Number(match[2])],
    index: Number(match[2]),
    isUrl: Boolean(match[1]),
    segment: translated.slice(match.index + match[0].length, matches[position + 1]?.index),
  }))

  const isIntact =
    tokens.every(({ entry, isUrl }) => entry && (entry.kind === 'autolink') === isUrl) &&
    new Set(tokens.map(({ entry }) => entry)).size === entries.length &&
    keepsLinkText(tokens) &&
    keepsLinksTogether(tokens)

  return isIntact ? tokens : undefined
}

// Letters and digits of scripts that separate words with spaces. Others can attach
// to a URL: Japanese, Chinese and Thai write no spaces, Korean, Arabic and Hebrew
// attach particles and prefixes.
const SPACED_WORD_CHARACTER = String.raw`(?![\p{Script=Arabic}\p{Script=Han}\p{Script=Hangul}\p{Script=Hebrew}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Khmer}\p{Script=Lao}\p{Script=Myanmar}\p{Script=Thai}\p{Script=Tibetan}])[\p{L}\p{N}]`
const ENDS_WITH_WORD = new RegExp(`${SPACED_WORD_CHARACTER}$`, 'u')
const STARTS_WITH_WORD = new RegExp(`^${SPACED_WORD_CHARACTER}`, 'u')

// A word touching a URL becomes part of the link once the editor re-detects it. This
// is the one join that is always wrong: elsewhere, words joined at a marker can be a
// correct German compound or Finnish suffix, so those are left as translated.
const separateUrlsFromWords = (tokens: Token[]) => {
  const visible = tokens.filter(({ entry, segment }) => entry.kind === 'autolink' || segment)

  visible.forEach((token, position) => {
    if (token.entry.kind !== 'autolink') {
      return
    }

    const before: Token | undefined = visible[position - 1]
    const isAdjacentUrl = before?.entry.kind === 'autolink' && !before.segment

    if (before && (isAdjacentUrl || ENDS_WITH_WORD.test(before.segment))) {
      before.segment += ' '
    }

    const next: Token | undefined = visible[position + 1]
    const words = token.segment || next?.entry.kind === 'autolink' ? token : next

    if (words && STARTS_WITH_WORD.test(words.segment)) {
      // A link keeps its own text, so the space goes behind the URL instead.
      if (words.entry.kind === 'link') {
        token.segment = ' '
      } else {
        words.segment = ` ${words.segment}`
      }
    }
  })
}

const nodesOf = (tokens: Token[]): RichTextNode[] =>
  tokens.flatMap(({ entry }) => (entry.kind === 'autolink' ? [] : [entry.node]))

// Words behind an autolink have no node of their own, so they get a new text node
// formatted like the closest words in front of it, or else the first words.
const addTextAfterAutolinks = (tokens: Token[], children: RichTextNode[]) => {
  let [template] = nodesOf(tokens)

  for (const { entry, segment } of tokens) {
    if (entry.kind !== 'autolink') {
      template = entry.node
    } else if (segment) {
      children.splice(children.indexOf(entry.item) + 1, 0, {
        type: 'text',
        detail: 0,
        format: template.format ?? 0,
        mode: 'normal',
        style: template.style ?? '',
        text: segment,
        version: 1,
      })
    }
  }
}

// Unmarked siblings (empty text nodes) keep their position; the marked ones are
// redistributed over their own positions in the order of the translation.
const reorder = (children: RichTextNode[], ordered: RichTextNode[]) => {
  const positions = ordered.map((node) => children.indexOf(node)).sort((a, b) => a - b)

  ordered.forEach((node, order) => {
    children[positions[order]] = node
  })
}

const applyTokens = (tokens: Token[], children: RichTextNode[]) => {
  for (const { entry, segment } of tokens) {
    if (entry.kind !== 'autolink') {
      entry.node.text = segment
    }
  }

  const items = [...new Set(tokens.map(({ entry }) => entry.item))]

  reorder(children, items)

  for (const item of items) {
    if (item.type === 'link' && hasOnlyTextChildren(item)) {
      const ownTokens = tokens.filter(({ entry }) => entry.item === item)

      reorder(item.children as RichTextNode[], nodesOf(ownTokens))
    }
  }

  addTextAfterAutolinks(tokens, children)
}

// Translate a maximal run of inline nodes. A single text node is sent as plain
// text (no markers). Anything else is joined into one marker-delimited value and
// split back apart once translated. A damaged translation keeps the source text
// of the whole run, which is visible to editors, rather than writing text into
// the wrong nodes.
const pushTextRun = (
  items: RichTextNode[],
  children: RichTextNode[],
  valuesToTranslate: ValueToTranslate[],
  req?: PayloadRequest,
) => {
  const entries = items
    .flatMap(collectRunEntries)
    .filter((entry) => entry.kind === 'autolink' || entry.node.text)

  const hasWords = entries.some(
    (entry) => entry.kind !== 'autolink' && String(entry.node.text).trim(),
  )

  if (!hasWords) {
    return
  }

  const [first] = entries

  if (entries.length === 1 && first.kind !== 'autolink') {
    valuesToTranslate.push({
      onTranslate: (translated) => {
        first.node.text = translated
      },
      value: first.node.text,
    })

    return
  }

  valuesToTranslate.push({
    onTranslate: (translated) => {
      if (typeof translated !== 'string') {
        return
      }

      const tokens = parseTokens(translated, entries)

      if (!tokens) {
        req?.payload.logger.warn(
          { translated },
          'Keeping the source text of a rich text segment: the translation damaged its markers or links.',
        )

        return
      }

      separateUrlsFromWords(tokens)
      applyTokens(tokens, children)
    },
    value: entries.map(toMarkedValue).join(''),
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
      const run: RichTextNode[] = []

      while (i < children.length && isInlineNode(children[i])) {
        run.push(children[i])
        i++
      }

      pushTextRun(run, children, valuesToTranslate, req)
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
