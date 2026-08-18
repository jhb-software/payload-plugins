import { defineConfig } from 'vitest/config'

export default defineConfig({
  oxc: {
    jsx: 'automatic',
  },
  test: {
    // Only the sources — `dist` holds compiled copies of the same tests.
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
