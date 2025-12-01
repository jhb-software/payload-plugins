import { payloadCloudinaryPlugin } from '@jhb.software/payload-cloudinary-plugin'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import { Images } from './collections/images'
import { Videos } from './collections/videos'
import { mongooseAdapter } from '@payloadcms/db-mongodb'

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
    Videos,
    Images,
    {
      slug: 'users',
      auth: true,
      fields: [],
    },
  ],
  db: mongooseAdapter({
    url: process.env.DATABASE_URI!,
  }),
  secret: process.env.PAYLOAD_SECRET!,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  plugins: [
    payloadCloudinaryPlugin({
      collections: {
        images: true,
        videos: {
          prefix: 'videos',
        },
      },
      folder: 'cloudinary-storage-plugin-test',
      cloudName: process.env.CLOUDINARY_CLOUD_NAME!,
      credentials: {
        apiKey: process.env.CLOUDINARY_API_KEY!,
        apiSecret: process.env.CLOUDINARY_API_SECRET!,
      },
      clientUploads: true,
    }),
  ],
  async onInit(payload: any) {
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
