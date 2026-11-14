import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['*.test.ts'],
    // Fixed values instead of the dev app's .env: Google is never called, every test mocks fetch.
    env: {
      GOOGLE_MAPS_API_KEY: 'test-api-key',
      PAYLOAD_DATABASE: 'sqlite',
      PAYLOAD_SECRET: 'test-secret-not-for-production',
      SQLITE_URL: 'file:./payload-test.db',
    },
    hookTimeout: 30000,
    testTimeout: 30000,
    fileParallelism: false, // test files share one database
  },
})
