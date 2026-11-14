import path from 'path'
import type { Payload } from 'payload'

/**
 * A Lexical text node. `format` is the inline-format bitmask
 * (bold 1, italic 2, strikethrough 4, underline 8, code 16).
 */
const text = (value: string, format = 0) => ({
  type: 'text',
  detail: 0,
  format,
  mode: 'normal',
  style: '',
  text: value,
  version: 1,
})

type DocId = number | string

/** A link node wrapping text. `url` external; defaults to opening a new tab. */
const link = (label: string, url: string) => ({
  type: 'link',
  version: 3,
  format: '',
  indent: 0,
  fields: { linkType: 'custom', url, newTab: true },
  children: [text(label)],
})

/** An internal link to another document; the Astro resolver turns it into an href. */
const internalLink = (label: string, relationTo: string, docId: DocId) => ({
  type: 'link',
  version: 3,
  format: '',
  indent: 0,
  fields: { linkType: 'internal', doc: { relationTo, value: docId }, newTab: false },
  children: [text(label)],
})

/** An inline block (e.g. a badge), rendered inline within a paragraph. */
const inlineBlock = (blockType: string, fields: Record<string, unknown>) => ({
  type: 'inlineBlock',
  version: 1,
  fields: { blockType, ...fields },
})

type InlineNode =
  | ReturnType<typeof text>
  | ReturnType<typeof link>
  | ReturnType<typeof internalLink>
  | ReturnType<typeof inlineBlock>

/** A paragraph of inline nodes. Pass a string for a plain single-text paragraph. */
const paragraph = (children: InlineNode[] | string) => ({
  type: 'paragraph',
  format: '',
  indent: 0,
  version: 1,
  direction: 'ltr',
  textFormat: 0,
  textStyle: '',
  children: typeof children === 'string' ? [text(children)] : children,
})

/** A paragraph wrapping a single text node — the body of every table cell. */
const para = (value: string) => paragraph(value)

/** A list entry: a leaf label, or a nested list produced by another `list(...)` call. */
type ListEntry = string | Record<string, unknown>

/** A `listitem` at nesting depth `indent`. `value` is its 1-based position. */
const listItem = (children: object[], value: number, indent = 0) => ({
  type: 'listitem',
  format: '',
  indent,
  version: 1,
  value,
  direction: 'ltr',
  children,
})

/**
 * A list. Each entry is either a leaf label or a nested list (from another
 * `list(..., level + 1)` call) placed right after the item it nests under.
 * Lexical stores an indented sublist as its own `listitem` wrapping that list,
 * which the renderer merges back into the preceding item.
 */
const list = (entries: ListEntry[], listType: 'bullet' | 'number' = 'bullet', level = 0) => ({
  type: 'list',
  format: '',
  indent: 0,
  version: 1,
  listType,
  start: 1,
  tag: listType === 'bullet' ? 'ul' : 'ol',
  direction: 'ltr',
  children: entries.map((entry, i) =>
    listItem([typeof entry === 'string' ? text(entry) : entry], i + 1, level),
  ),
})

const quote = (value: string) => ({
  type: 'quote',
  format: '',
  indent: 0,
  version: 1,
  direction: 'ltr',
  children: [text(value)],
})

const horizontalRule = () => ({ type: 'horizontalrule', version: 1 })

/** A block-level upload node referencing a media document by id. */
const uploadNode = (mediaId: DocId) => ({
  type: 'upload',
  version: 3,
  format: '',
  relationTo: 'media',
  value: mediaId,
})

/** A block-level custom block (e.g. a CTA), rendered by the dev app's BlockRenderer. */
const block = (blockType: string, fields: Record<string, unknown>) => ({
  type: 'block',
  version: 2,
  format: '',
  fields: { blockType, ...fields },
})

type CellOptions = { headerState?: number; colSpan?: number; rowSpan?: number }

/** A `tablecell`. `headerState` 0 = data, non-zero = header (1 ROW, 2 COLUMN, 3 BOTH). */
const cell = (value: string, { headerState = 0, colSpan = 1, rowSpan = 1 }: CellOptions = {}) => ({
  type: 'tablecell',
  version: 1,
  headerState,
  colSpan,
  rowSpan,
  children: [para(value)],
})

const tableRow = (children: ReturnType<typeof cell>[]) => ({
  type: 'tablerow',
  version: 1,
  children,
})

const table = (children: ReturnType<typeof tableRow>[]) => ({
  type: 'table',
  version: 1,
  children,
})

const heading = (value: string, tag: 'h1' | 'h2' | 'h3' = 'h2') => ({
  type: 'heading',
  tag,
  format: '',
  indent: 0,
  version: 1,
  direction: 'ltr',
  children: [text(value)],
})

type LexicalNode = { type: string; version: number; [k: string]: unknown }

const root = (children: LexicalNode[]) => ({
  root: {
    type: 'root',
    format: '' as const,
    indent: 0,
    version: 1,
    direction: 'ltr' as const,
    children,
  },
})

/**
 * One document exercising the three header scenarios the renderer must get
 * right per cell `headerState` (not by row index):
 *  - a standard top header row (→ `<thead>` with `<th>`)
 *  - a row-header column where the first row is NOT all headers (→ `<th>`
 *    cells living inside `<tbody>`, no `<thead>`)
 *  - `colSpan`/`rowSpan` spanning cells
 */
const tableContent = root([
  heading('Standard header row'),
  table([
    tableRow([
      cell('Feature', { headerState: 1 }),
      cell('Description', { headerState: 1 }),
      cell('Status', { headerState: 1 }),
    ]),
    tableRow([cell('Tables'), cell('Render Lexical tables to HTML'), cell('✓ Done')]),
    tableRow([cell('Spans'), cell('colspan / rowspan support'), cell('✓ Done')]),
  ]),
  heading('Row-header column (no thead)'),
  table([
    tableRow([cell('Mon', { headerState: 1 }), cell('Standup'), cell('9:00')]),
    tableRow([cell('Tue', { headerState: 1 }), cell('Review'), cell('10:00')]),
  ]),
  heading('Spanning cells'),
  table([
    tableRow([
      cell('Quarter', { headerState: 1 }),
      cell('Revenue', { headerState: 1, colSpan: 2 }),
    ]),
    tableRow([cell('Q1'), cell('EU'), cell('US')]),
    tableRow([cell('Carried over', { rowSpan: 2 }), cell('10'), cell('20')]),
    tableRow([cell('30'), cell('40')]),
  ]),
])

/** Non-table rich text, so the renderer's other nodes are exercised from real Payload output. */
const richTextContent = root([
  heading('Rich text rendering', 'h1'),
  paragraph([
    text('An ordinary paragraph with an external '),
    link('link to Payload', 'https://payloadcms.com'),
    text('.'),
  ]),
  heading('Text formats', 'h2'),
  paragraph([
    text('Every inline format: '),
    text('bold', 1),
    text(', '),
    text('italic', 2),
    text(', '),
    text('bold italic', 3),
    text(', '),
    text('strikethrough', 4),
    text(', '),
    text('underline', 8),
    text(', '),
    text('code', 16),
    text('. Plus H'),
    text('2', 32),
    text('O (subscript) and E=mc'),
    text('2', 64),
    text(' (superscript).'),
  ]),
  heading('Lists', 'h2'),
  list(['Unordered item one', 'Unordered item two', 'Unordered item three'], 'bullet'),
  list(['Ordered item one', 'Ordered item two'], 'number'),
  heading('Nested lists', 'h3'),
  list(
    [
      'Level 1 item',
      'Level 1 with a sublist',
      list(
        [
          'Level 2 ordered item',
          'Level 2 with a sublist',
          list(['Level 3 bullet item', 'Level 3 second item'], 'bullet', 2),
        ],
        'number',
        1,
      ),
      'Level 1 final item',
    ],
    'bullet',
  ),
  heading('Blockquote', 'h2'),
  quote('Tests prove correctness; the dev app proves usability.'),
  horizontalRule(),
  paragraph('Everything above came from a real document authored in Payload.'),
])

/**
 * Exercises the renderer's dependency-injected nodes — upload, custom block,
 * inline block, and internal link — each referencing a real CMS document.
 */
const componentsContent = (mediaId: DocId, pageId: DocId) =>
  root([
    heading('Components from the CMS', 'h1'),
    heading('Upload', 'h2'),
    uploadNode(mediaId),
    heading('Custom block', 'h2'),
    block('cta', {
      blockName: 'Call to Action',
      title: 'Get Started Today',
      description: 'Sign up for the newsletter.',
    }),
    heading('Inline block', 'h2'),
    paragraph([
      text('Status: '),
      inlineBlock('badge', { label: 'New' }),
      text(' — inline blocks render within a paragraph.'),
    ]),
    heading('Internal link', 'h2'),
    paragraph([
      text('This is an '),
      internalLink('internal link to the About page', 'pages', pageId),
      text(' resolved via the path field.'),
    ]),
  ])

type AdminCredentials = { email: string; password: string }

/**
 * Seeds the admin user (so autoLogin can sign in) and the demo document.
 * Each is created only when its collection is empty, so this is idempotent.
 */
export async function seed(payload: Payload, admin: AdminCredentials): Promise<void> {
  const userCount = await payload.count({ collection: 'users' })
  if (userCount.totalDocs === 0) {
    await payload.create({
      collection: 'users',
      data: { email: admin.email, password: admin.password },
    })
    payload.logger.info(`Seeded admin user ${admin.email}`)
  }

  const docCount = await payload.count({ collection: 'documents' })
  if (docCount.totalDocs === 0) {
    // The components demo references a real upload and a real internal-link target.
    const media = await payload.create({
      collection: 'media',
      data: { alt: 'Placeholder image' },
      filePath: path.resolve(process.cwd(), 'seed-assets/placeholder.svg'),
    })
    const about = await payload.create({
      collection: 'pages',
      data: { title: 'About Us', path: '/about' },
    })

    const documents = [
      { title: 'Table rendering demo', content: tableContent },
      { title: 'Rich text demo', content: richTextContent },
      { title: 'Components demo', content: componentsContent(media.id, about.id) },
    ]
    for (const data of documents) {
      await payload.create({ collection: 'documents', data })
    }
    payload.logger.info(`Seeded ${documents.length} demo documents`)
  }
}
