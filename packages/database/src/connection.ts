import { PGlite } from '@electric-sql/pglite'
import { mkdir } from 'node:fs/promises'
import {
  drizzle as createPgliteDatabase,
  type PgliteDatabase,
} from 'drizzle-orm/pglite'
import {
  drizzle as createPostgresDatabase,
  type PostgresJsDatabase,
} from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { sql } from 'drizzle-orm'
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
    if (config.dataDirectory !== 'memory://') {
      await mkdir(config.dataDirectory, { recursive: true })
    }
    const client = new PGlite(config.dataDirectory)
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

  const client = postgres(config.databaseUrl, {
    max: 5,
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
