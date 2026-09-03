import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as PgliteModule from '@electric-sql/pglite'

// Isolated in its own file, deliberately separate from database.test.ts:
// `vi.mock` rewrites this file's whole module graph, and every other test in
// the suite legitimately loads the real PGlite runtime through
// `createInMemoryDatabase`. Keeping the mock scoped to this file means it can
// never perturb those unrelated tests.
const pgliteLoadSpy = vi.fn()

vi.mock('@electric-sql/pglite', async (importOriginal) => {
  pgliteLoadSpy()
  return importOriginal<typeof PgliteModule>()
})

afterEach(() => {
  pgliteLoadSpy.mockClear()
  vi.resetModules()
})

describe('PostgreSQL mode never instantiates the PGlite runtime', () => {
  it('does not load @electric-sql/pglite when connecting in PostgreSQL mode', async () => {
    const { connectDatabase } = await import('../src/connection.js')

    // postgres.js connects lazily on first query, so this resolves without
    // ever reaching the network — this test needs no real Postgres server.
    const connection = await connectDatabase({
      databaseUrl: 'postgresql://example.invalid/ajani-preview',
      mode: 'postgres',
    })

    expect(pgliteLoadSpy).not.toHaveBeenCalled()
    await connection.close()
  })

  it('sanity check: PGlite mode does load @electric-sql/pglite', async () => {
    const { createInMemoryDatabase } = await import('../src/connection.js')

    const connection = await createInMemoryDatabase()

    expect(pgliteLoadSpy).toHaveBeenCalled()
    await connection.close()
  })

  it('does not load @electric-sql/pglite when migrating in PostgreSQL mode', async () => {
    const { connectDatabase } = await import('../src/connection.js')
    const { migrateDatabase } = await import('../src/migrate.js')

    const connection = await connectDatabase({
      databaseUrl: 'postgresql://example.invalid/ajani-preview',
      mode: 'postgres',
    })

    // The migration itself will fail (there is no real database at this
    // unreachable host) — only the absence of a PGlite import matters here.
    await migrateDatabase(connection).catch(() => undefined)

    expect(pgliteLoadSpy).not.toHaveBeenCalled()
    await connection.close()
  })
})

describe('PostgreSQL connection failures never surface credentials', () => {
  it('does not include the password from an unreachable connection URL in the thrown error', async () => {
    const { connectDatabase } = await import('../src/connection.js')
    const { migrateDatabase } = await import('../src/migrate.js')
    const secretPassword = 'sUpErFaKe-preview-secret-9f2c'
    // Port 1 is reserved and unroutable for Postgres traffic, so this never
    // reaches a real server — it fails locally and fast.
    const unreachableUrl = `postgresql://previewuser:${secretPassword}@127.0.0.1:1/ajani-preview`

    const connection = await connectDatabase({
      databaseUrl: unreachableUrl,
      mode: 'postgres',
    })

    try {
      await expect(migrateDatabase(connection)).rejects.toSatisfy((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        expect(message).not.toContain(secretPassword)
        expect(message).not.toContain(unreachableUrl)
        return true
      })
    } finally {
      await connection.close()
    }
  })
})
