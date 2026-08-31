import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    fileParallelism: false,
    maxWorkers: 1,
    pool: 'vmThreads',
    testTimeout: 15_000,
  },
})
