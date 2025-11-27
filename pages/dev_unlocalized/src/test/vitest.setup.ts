import { generateDatabaseAdapter, type DatabaseAdapter } from './generateDatabaseAdapter.js'

// Default to MongoDB if no database specified
const dbAdapter = (process.env.PAYLOAD_DATABASE as DatabaseAdapter) || 'mongodb'

// Generate the database adapter before tests run
generateDatabaseAdapter(dbAdapter)
