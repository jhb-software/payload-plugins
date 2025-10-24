import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  return {
    test: {
      env: loadEnv(mode, process.cwd(), ''), // Load .env variables
      hookTimeout: 30000, // Increase for Payload init
      testTimeout: 30000, // Increase for async operations
      globals: true, // Enable global test APIs (describe, it, etc.)
    },
  }
})
