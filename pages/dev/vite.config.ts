import path from 'path'
import { loadEnv } from 'vite'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vitest/config'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default defineConfig(({ mode }) => {
  return {
    test: {
      env: loadEnv(mode, process.cwd(), ''), // Load environment variables
      hookTimeout: 30000, // Increase hook timeout to 30 seconds
      testTimeout: 30000, // Increase test timeout to 30 seconds
      setupFiles: [path.resolve(dirname, 'src/test/vitest.setup.ts')],
    },
  }
})
