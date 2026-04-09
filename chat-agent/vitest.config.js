import { defineConfig } from 'vitest/config'

export default defineConfig({
  oxc: {
    jsx: 'automatic',
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    server: {
      deps: {
        inline: [/react-image-crop/, /@payloadcms/],
      },
    },
  },
})
