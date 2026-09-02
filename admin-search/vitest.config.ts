import { defineConfig } from 'vitest/config'

export default defineConfig({
  oxc: {
    jsx: 'automatic',
  },
  test: {
    // Only the sources. `dist` never holds tests (the build excludes them), so this keeps
    // a stray build output from being picked up as a second, stale copy of the suite.
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
