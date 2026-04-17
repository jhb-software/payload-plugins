import path from 'path'
import { loadEnv } from 'vite'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vitest/config'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, dirname, '')

  return {
    test: {
      env: {
        ...env,
        // Override SQLITE_URL to use an absolute path so the database is created
        // in this dev app's directory, not the root (CWD).
        ...(env.SQLITE_URL ? { SQLITE_URL: `file:${path.resolve(dirname, 'payload.db')}` } : {}),
      },
      include: [path.resolve(dirname, 'plugin.test.ts')],
      hookTimeout: 30000, // Increase hook timeout to 30 seconds
      testTimeout: 30000, // Increase test timeout to 30 seconds
      setupFiles: [path.resolve(dirname, 'src/test/vitest.setup.ts')],
    },
  }
})
