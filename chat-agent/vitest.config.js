import { defineConfig } from 'vitest/config'

export default defineConfig({
  oxc: {
    jsx: 'automatic',
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    server: {
      deps: {
        // Force Vitest to transform these packages so it can handle .css imports
        inline: [/@payloadcms\/ui/, /react-image-crop/],
      },
    },
  },
})
