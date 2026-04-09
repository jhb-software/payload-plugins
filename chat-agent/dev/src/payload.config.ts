import { chatAgentPlugin } from '@jhb.software/payload-chat-agent'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
        { title: 'Getting Started with Payload CMS', slug: 'getting-started', status: 'published' },
        { title: 'Advanced Field Configuration', slug: 'advanced-fields', status: 'published' },
        { title: 'Building Custom Endpoints', slug: 'custom-endpoints', status: 'draft' },
        { title: 'Authentication & Access Control', slug: 'auth-access', status: 'published' },
        { title: 'Plugin Development Guide', slug: 'plugin-dev', status: 'draft' },
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
      model: 'claude-haiku-4-5-20251001',
      superuserAccess: true,
      adminView: {
        Component: './src/components/ChatView',
      },
    }),
  ],
})
