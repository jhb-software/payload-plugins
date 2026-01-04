/**
 * Payload CMS Lexical Rich Text Node Types
 * Data format: { root: { children: LexicalNode[] } }
 * @see https://github.com/payloadcms/payload/tree/main/packages/richtext-lexical
 */

export interface LexicalNode {
  type: string
  indent: number
  version: number
  children?: LexicalNode[]
  direction?: 'ltr' | 'rtl'
  detail?: number
}

/**
 * @see https://github.com/payloadcms/payload/blob/main/packages/richtext-lexical/src/features/link/nodes/types.ts
 */
export interface LinkNode extends LexicalNode {
  type: 'link' | 'autolink'
  fields: LinkFields
}

export interface LinkFields {
  doc: {
    relationTo: string
    value:
      | {
          [key: string]: unknown
          id: string
          slug?: string
          path?: string
        }
      | string
  } | null
  linkType: 'custom' | 'internal'
  newTab: boolean
  url: string
}

export interface HeadingNode extends LexicalNode {
  type: 'heading'
  tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
}

export interface ParagraphNode extends LexicalNode {
  type: 'paragraph'
  format: 'justify' | 'left' | 'right' | 'center'
}

/**
 * Format bitmask: BOLD=1, ITALIC=2, STRIKETHROUGH=4, UNDERLINE=8, CODE=16, SUBSCRIPT=32, SUPERSCRIPT=64
 */
export interface TextNode extends LexicalNode {
  type: 'text'
  text: string
  style?: string
  mode?: 'normal' | string
  format: number
}

/**
 * @see https://lexical.dev/docs/api/modules/lexical_list
 */
export interface ListNode extends LexicalNode {
  type: 'list'
  listType: 'number' | 'bullet' | 'check'
  tag: 'ul' | 'ol'
}

export interface ListItemNode extends LexicalNode {
  type: 'listItem'
  checked?: boolean
}

/**
 * @see https://github.com/payloadcms/payload/blob/main/packages/richtext-lexical/src/features/blocks/server/nodes/BlocksNode.tsx
 */
export interface BlockNode extends LexicalNode {
  type: 'block'
  fields: {
    id: string
    blockName: string
    blockType: string
    [key: string]: unknown
  }
}

export interface InlineBlockNode extends LexicalNode {
  type: 'inlineBlock'
  fields: {
    id: string
    blockName: string
    blockType: string
    [key: string]: unknown
  }
}

/**
 * @see https://github.com/payloadcms/payload/blob/main/packages/richtext-lexical/src/features/upload/server/nodes/UploadNode.tsx
 */
export interface UploadNode extends LexicalNode {
  type: 'upload'
  relationTo: string
  value: {
    [key: string]: unknown
    id: string
    width: number
    height: number
    url: string
    alt: string
    filename: string
  }
}
