import { config } from 'dotenv'
import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

// Get the directory of this config file
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Try to load .env file from current directory first, then from config file directory
config({ path: path.resolve(process.cwd(), '.env') })
config({ path: path.resolve(__dirname, '.env') })

// Debug: log environment variables for CI troubleshooting
console.log('Current working directory:', process.cwd())
console.log('Config file directory:', __dirname)
console.log('Environment variables loaded:', {
  MONGODB_URL: process.env.MONGODB_URL ? '***set***' : 'undefined',
  SQLITE_URL: process.env.SQLITE_URL ? '***set***' : 'undefined',
  PAYLOAD_SECRET: process.env.PAYLOAD_SECRET ? '***set***' : 'undefined',
  NEXT_PUBLIC_FRONTEND_URL: process.env.NEXT_PUBLIC_FRONTEND_URL ? '***set***' : 'undefined'
})

export default defineConfig(() => {
  return {
    test: {
      env: process.env, // Pass all environment variables to tests
    },
  }
})
