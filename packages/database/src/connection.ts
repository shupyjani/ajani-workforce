import { mkdir } from 'node:fs/promises'
import { sql } from 'drizzle-orm'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import {
  drizzle as createPostgresDatabase,
  type PostgresJsDatabase,
} from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import {
  parseDatabaseConfig,
  type DatabaseConfig,
} from './config.js'
import * as schema from './schema.js'

export type PgliteAjaniDatabase = PgliteDatabase<typeof schema>
export type PostgresAjaniDatabase = PostgresJsDatabase<typeof schema>
export type AjaniDatabase = PgliteAjaniDatabase | PostgresAjaniDatabase

export interface PgliteDatabaseConnection {
  readonly mode: 'pglite'
  readonly db: PgliteAjaniDatabase
  readonly close: () => Promise<void>
}

export interface PostgresDatabaseConnection {
  readonly mode: 'postgres'
  readonly db: PostgresAjaniDatabase
  readonly close: () => Promise<void>
}

export type DatabaseConnection =
  | PgliteDatabaseConnection
  | PostgresDatabaseConnection

export async function connectDatabase(
  config: DatabaseConfig = parseDatabaseConfig(),
): Promise<DatabaseConnection> {
  if (config.mode === 'pglite') {
    // Loaded lazily so a PostgreSQL-mode process (the memory-constrained
    // hosted API) never pulls the PGlite runtime into memory at all, not
    // even unused. Only entered when `config.mode === 'pglite'`.
    const [{ PGlite: PgliteClient }, { drizzle: createPgliteDatabase }] =
      await Promise.all([
        import('@electric-sql/pglite'),
        import('drizzle-orm/pglite'),
      ])

    if (config.dataDirectory !== 'memory://') {
      await mkdir(config.dataDirectory, { recursive: true })
    }
    const client = new PgliteClient(config.dataDirectory)
    await client.waitReady
    const db = createPgliteDatabase({ client, schema })

    return {
      close: async () => {
        await client.close()
      },
      db,
      mode: 'pglite',
    }
  }

  // A deliberately small pool: this is a single free-tier API instance
  // talking to a single free-tier Postgres branch (e.g. Neon Free), not a
  // horizontally-scaled production deployment. `prepare: false` disables
  // server-side prepared statements, which many managed-Postgres connection
  // poolers (including Neon's pooled endpoint) don't support across pooled
  // connections. `sslmode` is read from `config.databaseUrl` itself — the
  // secure URL the provider supplies — so no separate SSL option is set here
  // and none disables it.
  const client = postgres(config.databaseUrl, {
    max: 3,
    prepare: false,
  })
  const db = createPostgresDatabase(client, { schema })

  return {
    close: async () => {
      await client.end({ timeout: 5 })
    },
    db,
    mode: 'postgres',
  }
}

export function createInMemoryDatabase(): Promise<PgliteDatabaseConnection> {
  return connectDatabase({ dataDirectory: 'memory://', mode: 'pglite' }) as Promise<PgliteDatabaseConnection>
}

export async function checkDatabaseReadiness(
  connection: DatabaseConnection,
): Promise<void> {
  await connection.db.execute(sql`select 1 as ready`)
}
