import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { myPlugin } from 'payload-plugin-template'
import { fileURLToPath } from 'url'
import { testEmailAdapter } from './emailAdapter'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    autoLogin: {
      email: 'dev@payloadcms.com',
      password: 'test',
    },
    user: 'users',
  },
  collections: [
    {
      slug: 'users',
      auth: true,
      fields: [],
    },
    {
      slug: 'pages',
      admin: {
        useAsTitle: 'title',
      },
      fields: [
        {
          name: 'title',
          type: 'text',
        },
        // These fields are used for testing the plugin:
        {
          name: 'location',
          type: 'point',
        },
        {
          name: 'locations',
          type: 'array',
          fields: [
            {
              name: 'location',
              type: 'point',
            },
          ],
        },
      ],
    },
    {
      slug: 'media',
      fields: [
        {
          name: 'text',
          type: 'text',
        },
      ],
      upload: true,
    },
  ],
  db: mongooseAdapter({
    url: process.env.DATABASE_URI!,
  }),
  email: testEmailAdapter,
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || 'SOME_SECRET',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  plugins: [
    myPlugin({
      debug: true,
    }),
  ],
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
        },
      })
    }
  },
})
