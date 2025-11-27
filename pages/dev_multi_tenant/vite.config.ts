import path from 'path'
import { loadEnv } from 'vite'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vitest/config'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default defineConfig(({ mode }) => {
  return {
    test: {
      env: loadEnv(mode, process.cwd(), ''),
      hookTimeout: 30000,
      testTimeout: 30000,
      setupFiles: [path.resolve(dirname, 'src/test/vitest.setup.ts')],
    },
  }
})
