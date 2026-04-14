import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { chatAgentPlugin } from '@jhb.software/payload-chat-agent'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })

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
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'text', required: true, unique: true },
        {
          name: 'status',
          type: 'select',
          options: ['draft', 'published', 'archived'],
          defaultValue: 'draft',
        },
        { name: 'content', type: 'richText' },
        { name: 'author', type: 'relationship', relationTo: 'users' },
        { name: 'featuredImage', type: 'relationship', relationTo: 'media' },
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
  secret: process.env.PAYLOAD_SECRET || 'chat-agent-dev-secret',
  typescript: {
    outputFile: path.resolve(__dirname, '../payload-types.ts'),
  },
  async onInit(payload) {
    const existingUsers = await payload.find({
      collection: 'users',
      limit: 1,
    })

    if (existingUsers.docs.length === 0) {
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
    const existingPosts = await payload.find({
      collection: 'posts',
      limit: 1,
    })

    if (existingPosts.docs.length === 0) {
      const posts = [
        {
          title: 'Getting Started with Payload CMS',
          slug: 'getting-started',
          status: 'published' as const,
        },
        {
          title: 'Advanced Field Configuration',
          slug: 'advanced-fields',
          status: 'published' as const,
        },
        { title: 'Building Custom Endpoints', slug: 'custom-endpoints', status: 'draft' as const },
        {
          title: 'Authentication & Access Control',
          slug: 'auth-access',
          status: 'published' as const,
        },
        { title: 'Plugin Development Guide', slug: 'plugin-dev', status: 'draft' as const },
      ]
      for (const post of posts) {
        await payload.create({ collection: 'posts', data: post })
      }
    }

    // Seed categories if none exist
    const existingCategories = await payload.find({
      collection: 'categories',
      limit: 1,
    })

    if (existingCategories.docs.length === 0) {
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
        { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
        { id: 'gpt-5-nano', label: 'GPT-5 nano' },
      ],
      defaultModel: 'claude-haiku-4-5-20251001',
      model: resolveModel,
      modes: {
        default: 'ask',
        access: {
          superuser: () => true,
        },
      },
    }),
  ],
})
