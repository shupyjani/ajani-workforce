import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    fileParallelism: false,
    include: ['test/postgres-concurrency.test.ts'],
    maxWorkers: 1,
    testTimeout: 30_000,
  },
})
