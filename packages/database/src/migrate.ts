import { fileURLToPath } from 'node:url'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator'
import type { DatabaseConnection } from './connection.js'

const migrationsFolder = fileURLToPath(
  new URL('../migrations', import.meta.url),
)

export async function migrateDatabase(
  connection: DatabaseConnection,
): Promise<void> {
  if (connection.mode === 'pglite') {
    await migratePglite(connection.db, { migrationsFolder })
    return
  }

  await migratePostgres(connection.db, { migrationsFolder })
}

export { migrationsFolder }
