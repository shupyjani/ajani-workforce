import { fileURLToPath } from 'node:url'
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator'
import type { DatabaseConnection } from './connection.js'

const migrationsFolder = fileURLToPath(
  new URL('../migrations', import.meta.url),
)

export async function migrateDatabase(
  connection: DatabaseConnection,
): Promise<void> {
  if (connection.mode === 'pglite') {
    // Loaded lazily so PostgreSQL-mode startup never pulls in the PGlite
    // migrator (see connection.ts's lazy PGlite import for the same reason).
    const { migrate: migratePglite } = await import('drizzle-orm/pglite/migrator')
    await migratePglite(connection.db, { migrationsFolder })
    return
  }

  await migratePostgres(connection.db, { migrationsFolder })
}

export { migrationsFolder }
