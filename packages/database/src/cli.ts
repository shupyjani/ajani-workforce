import { parseDatabaseConfig } from './config.js'
import { connectDatabase } from './connection.js'
import { migrateDatabase } from './migrate.js'
import {
  resetSyntheticPreview,
  seedSyntheticPreview,
} from './seed.js'
import { verifyDatabaseDelivery } from './verify.js'

type DatabaseCommand = 'migrate' | 'reset-preview' | 'seed' | 'verify'

function parseCommand(value: string | undefined): DatabaseCommand {
  if (
    value === 'migrate' ||
    value === 'seed' ||
    value === 'reset-preview' ||
    value === 'verify'
  ) {
    return value
  }
  throw new Error(
    'Expected a database command: migrate, seed, reset-preview, or verify.',
  )
}

const command = parseCommand(process.argv[2])

if (command === 'verify') {
  const result = await verifyDatabaseDelivery()
  process.stdout.write(
    `Verified ${String(result.rows)} deterministic synthetic rows across ${String(result.tables)} tables (${result.digest.slice(0, 12)}).\n`,
  )
} else {
  const config = parseDatabaseConfig()

  if (command === 'reset-preview' && config.mode !== 'pglite') {
    throw new Error('Preview reset is restricted to AJANI_DATA_MODE=pglite.')
  }

  const connection = await connectDatabase(config)
  try {
    if (command === 'migrate') {
      await migrateDatabase(connection)
      process.stdout.write(`Applied database migrations in ${connection.mode} mode.\n`)
    } else if (command === 'seed') {
      await migrateDatabase(connection)
      const summary = await seedSyntheticPreview(connection)
      process.stdout.write(
        `Seeded ${String(summary.workforceMembers)} synthetic workforce members in ${connection.mode} mode.\n`,
      )
    } else {
      await migrateDatabase(connection)
      const summary = await resetSyntheticPreview(connection, {
        confirmPreviewReset: true,
      })
      process.stdout.write(
        `Reset ${String(summary.workforceMembers)} synthetic workforce members in PGlite mode.\n`,
      )
    }
  } finally {
    await connection.close()
  }
}
