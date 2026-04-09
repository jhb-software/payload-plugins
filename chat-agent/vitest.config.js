import { defineConfig } from 'vitest/config'

export default defineConfig({
  oxc: {
    jsx: 'automatic',
  },
  test: {
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
    server: {
      deps: {
        inline: [/react-image-crop/, /@payloadcms/],
      },
    },
  },
})
