import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  return {
    test: {
      env: loadEnv(mode, process.cwd(), ''), // Load environment variables
      hookTimeout: 60000, // Increase hook timeout to 60 seconds
    },
  }
})
