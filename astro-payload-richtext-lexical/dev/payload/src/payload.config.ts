import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { en } from '@payloadcms/translations/languages/en'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'

import { Documents } from './collections/Documents'
import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { seed } from './seed'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Origin of the Astro preview app that fetches documents over the REST API.
const astroOrigin = process.env.ASTRO_ORIGIN ?? 'http://localhost:4321'

// This Payload app's own origin, so upload URLs are absolute and load from the
// Astro app (a different origin). Must match the port Payload actually runs on.
const serverURL = process.env.PAYLOAD_PUBLIC_URL ?? 'http://localhost:3000'

// Admin credentials for autoLogin and the seeded user. Override via .env
// (see .env.example); the fallbacks keep the dev app usable out of the box.
const adminEmail = process.env.PAYLOAD_ADMIN_EMAIL ?? 'dev@payloadcms.com'
const adminPassword = process.env.PAYLOAD_ADMIN_PASSWORD ?? 'test'

export default buildConfig({
  admin: {
    autoLogin: {
      email: adminEmail,
      password: adminPassword,
    },
    meta: { titleSuffix: '- Astro Lexical Renderer Dev' },
    user: 'users',
  },
  serverURL,
  // Allow the Astro dev app (different origin) to read documents via fetch.
  cors: [astroOrigin],
  i18n: {
    supportedLanguages: { en },
  },
  collections: [
    {
      slug: 'users',
      auth: true,
      fields: [],
    },
    Documents,
    Pages,
    Media,
  ],
  db: sqliteAdapter({
    client: {
      url: process.env.SQLITE_URL ?? 'file:./payload.db',
    },
  }),
  secret: process.env.PAYLOAD_SECRET ?? 'dev-only-insecure-secret',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  onInit: async (payload) => {
    await seed(payload, { email: adminEmail, password: adminPassword })
  },
})
