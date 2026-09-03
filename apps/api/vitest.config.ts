import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    fileParallelism: false,
    maxWorkers: 1,
    // Not vmThreads: @electric-sql/pglite's own internal chunk loading fails
    // to link when the package is reached via a dynamic `import()` inside a
    // V8 vm sandbox (packages/database's connectDatabase now imports it
    // lazily, only in PGlite mode, so PostgreSQL-mode processes never load it
    // at all). `forks` runs genuine Node processes with standard module
    // resolution instead.
    pool: 'forks',
    testTimeout: 15_000,
  },
})
