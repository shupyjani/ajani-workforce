import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const apiProxyTarget =
  process.env['AJANI_API_PROXY_TARGET'] ?? 'http://127.0.0.1:3000'

const apiProxy = {
  '/health': {
    changeOrigin: true,
    target: apiProxyTarget,
  },
  '/live': {
    changeOrigin: true,
    target: apiProxyTarget,
  },
  '/ready': {
    changeOrigin: true,
    target: apiProxyTarget,
  },
  '/api': {
    changeOrigin: true,
    target: apiProxyTarget,
  },
}

export default defineConfig({
  plugins: [react()],
  preview: {
    proxy: apiProxy,
  },
  server: {
    proxy: apiProxy,
  },
  test: {
    environment: 'jsdom',
    fileParallelism: false,
    maxWorkers: 1,
    pool: 'vmThreads',
    setupFiles: './src/test/setup.ts',
  },
})
