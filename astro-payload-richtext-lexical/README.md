# JHB Software - Astro Payload RichText Lexical

[![NPM Version](https://img.shields.io/npm/v/%40jhb.software%2Fastro-payload-richtext-lexical)](https://www.npmjs.com/package/@jhb.software/astro-payload-richtext-lexical)

Renders Payload CMS Lexical rich text content to Astro elements.

## Installation

```bash
npm install @jhb.software/astro-payload-richtext-lexical
# or
pnpm add @jhb.software/astro-payload-richtext-lexical
```

## Usage

```astro
---
import RichTextLexical from '@jhb.software/astro-payload-richtext-lexical/RichTextLexical.astro'
import CustomUpload from '../components/CustomUpload.astro'
import CustomBlock from '../components/CustomBlock.astro'

// content.root.children is the Lexical JSON from Payload CMS
const { content } = Astro.props
---

<RichTextLexical
  nodes={content.root.children}
  UploadRenderer={CustomUpload}
  BlockRenderer={CustomBlock}
/>
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `nodes` | `LexicalNode[]` | Yes | The array of Lexical nodes from `content.root.children` |
| `UploadRenderer` | `AstroComponentFactory` | No | Custom component to render upload nodes |
| `BlockRenderer` | `AstroComponentFactory` | No | Custom component to render block and inline block nodes |

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
    id: string
    url: string
    alt: string
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
  inline: boolean  // true for inline blocks, false for regular blocks
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

You can import types for use in your custom renderers:

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
} from '@jhb.software/astro-payload-richtext-lexical'
```

## Contributing

We welcome contributions! Please open an issue to report bugs or suggest improvements, or submit a pull request with your changes.
