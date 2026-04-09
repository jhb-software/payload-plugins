import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    server: {
      deps: {
        // Force Vitest to transform these packages so it can handle .css imports
        inline: [/@payloadcms\/ui/, /react-image-crop/],
      },
    },
  },
})
