import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vitest/config'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default defineConfig({
  test: {
    include: ['*.test.ts'],
    // Fixed values instead of the dev app's .env: the Cloudinary SDK is mocked, and a fixed API
    // secret keeps signatures computed by the tests deterministic.
    env: {
      CLOUDINARY_API_KEY: 'test-api-key',
      CLOUDINARY_API_SECRET: 'test-api-secret',
      CLOUDINARY_CLOUD_NAME: 'demo',
      PAYLOAD_DATABASE: 'sqlite',
      PAYLOAD_SECRET: 'test-secret-not-for-production',
      SQLITE_URL: 'file:./payload-test.db',
    },
    hookTimeout: 30000,
    testTimeout: 30000,
    setupFiles: [path.resolve(dirname, 'src/test/cloudinaryMock.ts')],
    fileParallelism: false, // test files share one database
  },
})
