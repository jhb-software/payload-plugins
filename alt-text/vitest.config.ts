import { defineConfig } from 'vitest/config'

export default defineConfig({
  oxc: {
    jsx: 'automatic',
  },
  test: {
    // The legacy test/*.test.ts files use node:test instead of vitest.
    // They are executed separately via `test:health`.
    exclude: ['**/node_modules/**', '**/dev/**', '**/dev_unlocalized/**', 'test/**'],
  },
})
