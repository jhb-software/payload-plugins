import assert from 'node:assert/strict'
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { test } from 'vitest'

import RichTextLexical from '../src/RichTextLexical.astro'
import type { LexicalNode } from '../src/types.ts'

/** A paragraph reading `external <link>link to Payload</link>.` — the inline-link shape. */
const inlineLinkParagraph: LexicalNode[] = [
  {
    type: 'paragraph',
    version: 1,
    children: [
      { type: 'text', version: 1, text: 'external ' },
      {
        type: 'link',
        version: 1,
        fields: { linkType: 'custom', url: 'https://payloadcms.com', newTab: false },
        children: [{ type: 'text', version: 1, text: 'link to Payload' }],
      },
      { type: 'text', version: 1, text: '.' },
    ],
  },
] as unknown as LexicalNode[]

test('renders an inline link without inserting whitespace around the link text', async () => {
  const container = await AstroContainer.create()
  const html = await container.renderToString(RichTextLexical, {
    props: { nodes: inlineLinkParagraph },
  })

  assert.match(html, /external <a [^>]*>link to Payload<\/a>\./)
})
