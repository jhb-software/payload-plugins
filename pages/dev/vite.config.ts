import { config } from 'dotenv'
import { defineConfig } from 'vitest/config'
import path from 'path'

// Load environment variables from .env file in the current directory
config({ path: path.resolve(process.cwd(), '.env') })

export default defineConfig(() => {
  return {
    test: {
      env: process.env, // Pass all environment variables to tests
    },
  }
})
