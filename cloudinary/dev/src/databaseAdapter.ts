import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { sqliteAdapter } from '@payloadcms/db-sqlite'

// `pnpm dev` runs on MongoDB. The integration tests set PAYLOAD_DATABASE=sqlite so they need no
// database server.
export const databaseAdapter =
  process.env.PAYLOAD_DATABASE === 'sqlite'
    ? sqliteAdapter({
        client: {
          url: process.env.SQLITE_URL!,
        },
        // The sqlite adapter runs without transactions unless this is set.
        transactionOptions: {},
      })
    : mongooseAdapter({
        url: process.env.DATABASE_URI!,
      })
