import { geocodingField, myPlugin } from '@jhb.software/payload-geocoding-plugin'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import path from 'path'
import { buildConfig } from 'payload'
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

        // Minimal field config - not required
        geocodingField({
          pointField: {
            name: 'location',
            type: 'point',
          },
        }),

        // readOnly field
        geocodingField({
          pointField: {
            name: 'location0',
            type: 'point',
            required: false,
            admin: {
              readOnly: true,
            },
          },
        }),

        // Minimal field config - required
        geocodingField({
          pointField: {
            name: 'location1',
            type: 'point',
            required: true,
          },
        }),

        // Minimal field config - required
        geocodingField({
          pointField: {
            name: 'location2',
            type: 'point',
            required: true,
          },
          geoDataFieldOverride: {
            required: true,
          },
        }),

        // With geoDataFieldOverride
        geocodingField({
          pointField: {
            name: 'location3',
            type: 'point',
          },
          geoDataFieldOverride: {
            label: 'Geodata (Custom label)',
            access: {
              read: () => true,
              update: () => true,
              create: () => true,
            },
            admin: {
              readOnly: false,
            },
          },
        }),

        // Usage inside a group
        {
          name: 'locationGroup',
          type: 'group',
          fields: [
            geocodingField({
              pointField: {
                name: 'location',
                type: 'point',
              },
            }),
          ],
        },

        // Usage inside an array
        {
          name: 'locations',
          type: 'array',
          fields: [
            geocodingField({
              pointField: {
                name: 'location',
                type: 'point',
              },
            }),
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
  secret: process.env.PAYLOAD_SECRET!,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  plugins: [myPlugin({})],
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
