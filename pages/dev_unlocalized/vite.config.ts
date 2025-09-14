import { config } from 'dotenv'
import { defineConfig } from 'vitest/config'

// Load environment variables from .env file
config()

export default defineConfig(() => {
  return {
    test: {
      env: process.env, // Pass all environment variables to tests
    },
  }
})
