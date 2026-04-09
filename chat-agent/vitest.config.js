import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    server: {
      deps: {
        inline: [/react-image-crop/, /@payloadcms/],
      },
    },
  },
})
