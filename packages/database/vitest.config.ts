import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['test/postgres-concurrency.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    pool: 'vmThreads',
    testTimeout: 30_000,
  },
})
