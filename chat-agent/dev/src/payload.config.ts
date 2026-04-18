import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { chatAgentPlugin, createPayloadBudget } from '@jhb.software/payload-chat-agent'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'

import { customTools } from './customTools.js'
import { postsEndpoints, rootEndpoints } from './endpoints.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Per-user daily token budget wired to a Payload collection. Demonstrates the
// `createPayloadBudget` helper in action — swap `period: 'daily'` for
// `'monthly'` or a custom resolver, and `scope: 'user'` for `'global'` or a
// custom key (e.g. `({ req }) => \`org:${req.user?.orgId}\``) to fit.
const chatBudget = createPayloadBudget({
  limit: 200_000,
  period: 'daily',
  scope: 'user',
})

// Build a minimal valid Lexical `SerializedEditorState` from an array of
// plain-text paragraphs. Matches the shape Payload's lexical editor produces
// for a paragraphs-only document, so the seeded posts round-trip through the
// admin panel without triggering the "Slate → Lexical" migration error.
const lexicalFromParagraphs = (paragraphs: string[]) => ({
  root: {
    type: 'root',
    format: '' as const,
    indent: 0,
    version: 1,
    direction: 'ltr' as const,
    children: paragraphs.map((text) => ({
      type: 'paragraph',
      format: '' as const,
      indent: 0,
      version: 1,
      direction: 'ltr' as const,
      textFormat: 0,
      textStyle: '',
      children: [
        {
          type: 'text',
          detail: 0,
          format: 0,
          mode: 'normal',
          style: '',
          text,
          version: 1,
        },
      ],
    })),
  },
})

const resolveModel = (id: string) => {
  if (id.startsWith('claude-')) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set — required to use Claude models in this dev app',
      )
    }
    return anthropic(id)
  }
  if (id.startsWith('gpt-')) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set — required to use OpenAI models in this dev app')
    }
    return openai(id)
  }
  throw new Error(
    `Unknown model id "${id}". Add the id to availableModels and a routing rule in dev/src/payload.config.ts.`,
  )
}

export default buildConfig({
  admin: {
    autoLogin: {
      email: 'dev@payloadcms.com',
      password: 'test',
    },
    meta: { titleSuffix: '- Chat Agent Dev' },
    user: 'users',
  },
  blocks: [
    {
      slug: 'cta',
      interfaceName: 'CtaBlock',
      labels: { singular: 'Call to Action', plural: 'Calls to Action' },
      fields: [
        { name: 'heading', type: 'text', required: true },
        { name: 'buttonLabel', type: 'text', required: true },
        { name: 'buttonHref', type: 'text', required: true },
      ],
    },
    {
      slug: 'hero',
      labels: { singular: 'Hero', plural: 'Heroes' },
      fields: [
        { name: 'headline', type: 'text', required: true },
        { name: 'subheadline', type: 'text' },
        { name: 'image', type: 'relationship', relationTo: 'media' },
      ],
    },
  ],
  collections: [
    {
      slug: 'users',
      auth: true,
      fields: [
        {
          name: 'role',
          type: 'select',
          options: ['admin', 'editor', 'viewer'],
          defaultValue: 'editor',
        },
      ],
    },
    {
      slug: 'posts',
      admin: { useAsTitle: 'title' },
      endpoints: postsEndpoints,
      versions: { drafts: true },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'text', required: true, unique: true },
        {
          name: 'path',
          type: 'text',
          virtual: true,
          hooks: {
            afterRead: [({ data }) => (data?.slug ? `/posts/${data.slug}` : undefined)],
          },
        },
        { name: 'content', type: 'richText' },
        { name: 'author', type: 'relationship', relationTo: 'users' },
        { name: 'featuredImage', type: 'relationship', relationTo: 'media' },
        // Reference case: `layout` uses globally-declared blocks by slug.
        // `getCollectionSchema({ slug: 'posts' })` resolves each slug against
        // `config.blocks` so the agent sees cta + hero fields inlined.
        //
        // Payload rejects mixing `blockReferences` and inline `blocks` on the
        // same field ("You cannot have both blockReferences and blocks in the
        // same blocks field"), so inline blocks live on `sidebar` below.
        {
          name: 'layout',
          type: 'blocks',
          blockReferences: ['cta', 'hero'],
          blocks: [],
        },
        // Inline case: `pullQuote` and `socialLinks` are scoped to this field
        // and do not appear in `listBlocks`.
        {
          name: 'sidebar',
          type: 'blocks',
          blocks: [
            {
              slug: 'pullQuote',
              fields: [
                { name: 'quote', type: 'textarea', required: true },
                { name: 'attribution', type: 'text' },
              ],
            },
            {
              slug: 'socialLinks',
              fields: [
                { name: 'twitter', type: 'text' },
                { name: 'github', type: 'text' },
              ],
            },
          ],
        },
      ],
    },
    {
      slug: 'categories',
      admin: { useAsTitle: 'name' },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'description', type: 'textarea' },
      ],
    },
    {
      slug: 'media',
      admin: { useAsTitle: 'filename' },
      upload: {
        staticDir: path.resolve(__dirname, '../media'),
        mimeTypes: ['image/*'],
      },
      fields: [{ name: 'alt', type: 'text' }],
    },
    chatBudget.collection,
  ],
  globals: [
    {
      slug: 'settings',
      fields: [
        { name: 'siteName', type: 'text', defaultValue: 'My Site' },
        { name: 'tagline', type: 'text' },
      ],
    },
  ],
  db: mongooseAdapter({
    url: process.env.DATABASE_URI || 'mongodb://localhost:27017/chat-agent-dev',
  }),
  editor: lexicalEditor(),
  endpoints: rootEndpoints,
  secret: process.env.PAYLOAD_SECRET || 'chat-agent-dev-secret',
  typescript: {
    outputFile: path.resolve(__dirname, '../payload-types.ts'),
  },
  async onInit(payload) {
    const existingUsers = await payload.count({
      collection: 'users',
    })

    if (existingUsers.totalDocs === 0) {
      await payload.create({
        collection: 'users',
        data: {
          email: 'dev@payloadcms.com',
          password: 'test',
          role: 'admin',
        },
      })
    }

    // Seed some posts if none exist
    const existingPosts = await payload.count({
      collection: 'posts',
    })

    if (existingPosts.totalDocs === 0) {
      const posts = [
        {
          title: 'Getting Started with Payload CMS',
          slug: 'getting-started',
          _status: 'published' as const,
          content: lexicalFromParagraphs([
            'Payload is a headless CMS and application framework built with TypeScript, Next.js, and React.',
            'This guide walks you through installing the CLI, scaffolding a project, and running the admin panel locally.',
          ]),
        },
        {
          title: 'Advanced Field Configuration',
          slug: 'advanced-fields',
          _status: 'published' as const,
          content: lexicalFromParagraphs([
            'Beyond the basic text and number fields, Payload ships with arrays, blocks, relationships, and richText.',
            'Each field supports access control, hooks, and validation — compose them to model any domain.',
          ]),
        },
        {
          title: 'Building Custom Endpoints',
          slug: 'custom-endpoints',
          _status: 'draft' as const,
          content: lexicalFromParagraphs([
            'Custom endpoints let you expose REST routes alongside the generated collection API.',
            'Use `req.payload` inside a handler to run Local API calls with full access and hook context.',
          ]),
        },
        {
          title: 'Authentication & Access Control',
          slug: 'auth-access',
          _status: 'published' as const,
          content: lexicalFromParagraphs([
            'Payload ships with a pluggable auth strategy and a fine-grained access control system.',
            'Access functions run per operation and can return booleans or query constraints to scope results.',
          ]),
        },
        {
          title: 'Plugin Development Guide',
          slug: 'plugin-dev',
          _status: 'draft' as const,
          content: lexicalFromParagraphs([
            'A Payload plugin is a function that receives the incoming config and returns a modified one.',
            'Plugins can add collections, fields, endpoints, hooks, and admin UI overrides in a single package.',
          ]),
        },
      ]
      for (const post of posts) {
        await payload.create({ collection: 'posts', data: post })
      }
    }

    // Seed categories if none exist
    const existingCategories = await payload.count({
      collection: 'categories',
    })

    if (existingCategories.totalDocs === 0) {
      const categories = [
        { name: 'Tutorials', description: 'Step-by-step guides' },
        { name: 'Reference', description: 'API documentation and reference material' },
        { name: 'Announcements', description: 'Product updates and news' },
      ]
      for (const cat of categories) {
        await payload.create({ collection: 'categories', data: cat })
      }
    }
  },
  plugins: [
    chatAgentPlugin({
      access: () => true,
      availableModels: [
        { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
        { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
        { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
        { id: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
        { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
        { id: 'gpt-5-nano', label: 'GPT-5 nano' },
      ],
      budget: chatBudget.budget,
      defaultModel: 'claude-haiku-4-5-20251001',
      model: resolveModel,
      // One `tools` factory composes the final toolset the agent sees.
      // Spread `defaultTools` to keep the built-in Payload tools, then add
      // user-defined tools and provider-native ones (executed server-side by
      // the provider, billed separately ~$10 / 1k searches).
      //
      // Using `webFetch_20250910` (pre-dynamic-filtering) so this works with
      // all models. The newer `webFetch_20260209` adds code-execution-based
      // filtering but requires Opus 4.6+/Sonnet 4.6.
      tools: ({ defaultTools, req }) => ({
        ...defaultTools,
        ...customTools({ req }),
        webFetch: anthropic.tools.webFetch_20250910(),
        webSearch: anthropic.tools.webSearch_20250305({ maxUses: 5 }),
      }),
      modes: {
        default: 'ask',
        access: {
          superuser: () => true,
        },
      },
    }),
  ],
})
