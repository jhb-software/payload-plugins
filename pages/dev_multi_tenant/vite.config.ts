import { config } from 'dotenv'
import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

// Get the directory of this config file
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Try to load .env file from current directory first, then from config file directory
const cwdEnvPath = path.resolve(process.cwd(), '.env')
const configEnvPath = path.resolve(__dirname, '.env')

// Debug: Check if .env files exist and their content
import { existsSync, readFileSync } from 'fs'

console.log('Current working directory:', process.cwd())
console.log('Config file directory:', __dirname)
console.log('CWD .env path:', cwdEnvPath)
console.log('Config .env path:', configEnvPath)
console.log('CWD .env exists:', existsSync(cwdEnvPath))
console.log('Config .env exists:', existsSync(configEnvPath))

if (existsSync(cwdEnvPath)) {
  console.log('CWD .env content:', readFileSync(cwdEnvPath, 'utf8').replace(/MONGODB_URL=.*/g, 'MONGODB_URL=***').replace(/PAYLOAD_SECRET=.*/g, 'PAYLOAD_SECRET=***'))
}
if (existsSync(configEnvPath)) {
  console.log('Config .env content:', readFileSync(configEnvPath, 'utf8').replace(/MONGODB_URL=.*/g, 'MONGODB_URL=***').replace(/PAYLOAD_SECRET=.*/g, 'PAYLOAD_SECRET=***'))
}

config({ path: cwdEnvPath })
config({ path: configEnvPath })

// Debug: log environment variables for CI troubleshooting
console.log('Environment variables loaded:', {
  MONGODB_URL: process.env.MONGODB_URL && process.env.MONGODB_URL !== 'undefined' ? '***set***' : 'undefined',
  SQLITE_URL: process.env.SQLITE_URL && process.env.SQLITE_URL !== 'undefined' ? '***set***' : 'undefined',
  PAYLOAD_SECRET: process.env.PAYLOAD_SECRET && process.env.PAYLOAD_SECRET !== 'undefined' ? '***set***' : 'undefined',
  NEXT_PUBLIC_FRONTEND_URL: process.env.NEXT_PUBLIC_FRONTEND_URL && process.env.NEXT_PUBLIC_FRONTEND_URL !== 'undefined' ? '***set***' : 'undefined'
})

export default defineConfig(() => {
  return {
    test: {
      env: process.env, // Pass all environment variables to tests
    },
  }
})
