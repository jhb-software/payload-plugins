import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  return {
    test: {
      env: loadEnv(mode, process.cwd(), ''), // Load environment variables
      hookTimeout: 30000, // Increase hook timeout to 30 seconds
      testTimeout: 30000, // Increase test timeout to 30 seconds
    },
  }
})
