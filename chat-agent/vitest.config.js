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
        // Force these through Vite's transform so CSS imports (e.g.
        // react-image-crop/dist/ReactCrop.css pulled in via @payloadcms/ui)
        // don't hit Node's ESM loader, which can't handle .css extensions.
        inline: [/react-image-crop/, /@payloadcms/],
      },
    },
  },
})
