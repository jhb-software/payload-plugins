# JHB Software - Astro Payload RichText Lexical Renderer

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fastro-payload-richtext-lexical)](https://www.npmjs.com/package/@jhb.software/astro-payload-richtext-lexical)

Renders Payload CMS Lexical rich text content to Astro elements.

## Installation

```bash
pnpm add @jhb.software/astro-payload-richtext-lexical
```

## Usage

```astro
---
import RichTextLexical from '@jhb.software/astro-payload-richtext-lexical/RichTextLexical.astro'
import CustomUpload from '../components/CustomUpload.astro'
import CustomBlock from '../components/CustomBlock.astro'

// content is the Lexical JSON from Payload CMS
const { content } = Astro.props
---

<RichTextLexical
  nodes={content.root.children}
  UploadRenderer={CustomUpload}
  BlockRenderer={CustomBlock}
/>
```

## Props

| Prop                  | Type                        | Required | Description                                             |
| --------------------- | --------------------------- | -------- | ------------------------------------------------------- |
| `nodes`               | `LexicalNode[]`             | Yes      | The array of Lexical nodes from `content.root.children` |
| `class`               | `string`                    | No       | CSS class to apply to the wrapper div                   |
| `UploadRenderer`      | `AstroComponentFactory`     | No       | Custom component to render upload nodes                 |
| `BlockRenderer`       | `AstroComponentFactory`     | No       | Custom component to render block and inline block nodes |
| `slugifyHeadingId`    | `SlugifyHeadingId \| false` | No       | Custom function for heading IDs, or `false` to disable  |
| `resolveInternalLink` | `ResolveInternalLink`       | No       | Custom function to resolve internal link hrefs          |

## Usage with Tailwind CSS Typography

The component outputs semantic HTML without any styling. You can use [Tailwind CSS Typography](https://tailwindcss.com/docs/typography-plugin) (`@tailwindcss/typography`) to style the content by adding the `prose` class to the wrapper div.

```astro
<RichTextLexical
  nodes={content.root.children}
  class="prose"
  UploadRenderer={CustomUpload}
  BlockRenderer={CustomBlock}
/>
```

## Custom Renderers

### UploadRenderer

The `UploadRenderer` component receives:

```ts
type Props = {
  node: UploadNode
}

interface UploadNode {
  type: 'upload'
  relationTo: string
  value: {
    id: string | number
    url: string
    width: number
    height: number
    filename: string
    [key: string]: unknown
  }
}
```

### BlockRenderer

The `BlockRenderer` component receives:

```ts
type Props = {
  node: BlockNode | InlineBlockNode
  inline: boolean // true for inline blocks, false for regular blocks
}

interface BlockNode {
  type: 'block'
  fields: {
    id: string
    blockName: string
    blockType: string
    [key: string]: unknown
  }
}
```

## Configuration Options

### slugifyHeadingId

By default, `h2` and `h3` headings automatically get an `id` attribute generated from their text content (useful for anchor links and table of contents).

```astro
<!-- Default behavior: h2/h3 get auto-generated IDs -->
<RichTextLexical nodes={content.root.children} />

<!-- Disable heading IDs entirely -->
<RichTextLexical nodes={content.root.children} slugifyHeadingId={false} />

<!-- Custom slugify function -->
<RichTextLexical
  nodes={content.root.children}
  slugifyHeadingId={(text, tag) => {
    // Generate IDs for all headings, not just h2/h3
    return text.toLowerCase().replace(/\s+/g, '-')
  }}
/>
```

The function signature:

```ts
type SlugifyHeadingId = (text: string, tag: string) => string | undefined
```

### resolveInternalLink

Internal links in Payload CMS reference documents by their ID. By default, the renderer uses the `path` field from the populated document (works with [@jhb.software/payload-pages-plugin](https://github.com/jhb-software/payload-plugins/tree/main/pages)).

For custom URL structures, provide your own resolver:

```astro
---
import RichTextLexical from '@jhb.software/astro-payload-richtext-lexical/RichTextLexical.astro'
import type { ResolveInternalLink } from '@jhb.software/astro-payload-richtext-lexical'

const resolveInternalLink: ResolveInternalLink = (doc, relationTo) => {
  // Use path field if available
  if ('path' in doc && typeof doc.path === 'string') {
    return doc.path
  }
  // Fallback to slug for blog posts
  if ('slug' in doc && typeof doc.slug === 'string') {
    if (relationTo === 'posts') {
      return `/blog/${doc.slug}`
    }
    return `/${doc.slug}`
  }
  return undefined
}
---

<RichTextLexical nodes={content.root.children} resolveInternalLink={resolveInternalLink} />
```

The function signature:

```ts
type ResolveInternalLink = (doc: Record<string, unknown>, relationTo: string) => string | undefined
```

## Supported Node Types

- `heading` (h1-h6)
- `paragraph`
- `text` (with formatting: bold, italic, underline, strikethrough, code, subscript, superscript)
- `link` / `autolink`
- `list` (ordered and unordered)
- `listitem`
- `quote` (blockquote)
- `table`
- `upload` (requires `UploadRenderer`)
- `block` / `inlineBlock` (requires `BlockRenderer`)
- `horizontalrule`
- `linebreak`

## Types

You can import types for use in your custom renderers and configuration:

```ts
import type {
  LexicalNode,
  HeadingNode,
  ParagraphNode,
  TextNode,
  LinkNode,
  ListNode,
  UploadNode,
  BlockNode,
  InlineBlockNode,
  SlugifyHeadingId,
  ResolveInternalLink,
} from '@jhb.software/astro-payload-richtext-lexical'
```

## Contributing

We welcome contributions! Please open an issue to report bugs or suggest improvements, or submit a pull request with your changes.
