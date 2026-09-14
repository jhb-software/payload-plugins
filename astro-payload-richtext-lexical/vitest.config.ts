/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config'

// Astro's own vite config is required so `.astro` components compile inside the test run;
// the plain `vite.config.ts` next to it only describes the library build.
export default getViteConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
})
