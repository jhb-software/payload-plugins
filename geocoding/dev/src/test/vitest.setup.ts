import { generateDatabaseAdapter, type DatabaseAdapter } from './generateDatabaseAdapter.js'

// Default to SQLite if no database specified
const dbAdapter = (process.env.PAYLOAD_DATABASE as DatabaseAdapter) || 'sqlite'

generateDatabaseAdapter(dbAdapter)
