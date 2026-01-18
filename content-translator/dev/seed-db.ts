import { getPayload } from 'payload'

import config from './src/payload.config.js'

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...')

    const payload = await getPayload({ config })

    // Import and run the seed function
    const { seed } = await import('./src/seed.js')
    await seed(payload)

    console.log('✅ Database seeding completed successfully!')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error seeding database:', error)
    process.exit(1)
  }
}

// Handle the unhandled promise
seedDatabase().catch((error) => {
  console.error('❌ Unhandled error in seedDatabase:', error)
  process.exit(1)
})
