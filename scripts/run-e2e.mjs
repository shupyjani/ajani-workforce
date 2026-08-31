import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const repositoryRoot = resolve(import.meta.dirname, '..')
const apiOrigin = 'http://127.0.0.1:43117'
const webOrigin = 'http://127.0.0.1:43118'
const children = new Set()
let stopping = false

function launch(args, env = {}) {
  const child = spawn(process.execPath, args, {
    cwd: repositoryRoot,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    windowsHide: true,
  })
  children.add(child)
  child.once('exit', () => {
    children.delete(child)
  })
  return child
}

async function waitForUrl(url, child, label) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${label} exited before becoming ready.`)
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
      if (response.ok) {
        return
      }
    } catch {
      // Retry until the bounded readiness deadline.
    }
    await new Promise((resolveDelay) => {
      setTimeout(resolveDelay, 100)
    })
  }
  throw new Error(`${label} did not become ready within 30 seconds.`)
}

function waitForExit(child, timeoutMilliseconds) {
  if (child.exitCode !== null) {
    return Promise.resolve(true)
  }
  return new Promise((resolveExit) => {
    const timer = setTimeout(() => {
      child.off('exit', onExit)
      resolveExit(false)
    }, timeoutMilliseconds)
    function onExit() {
      clearTimeout(timer)
      resolveExit(true)
    }
    child.once('exit', onExit)
  })
}

async function stopChild(child) {
  if (child.exitCode !== null) {
    return
  }
  child.kill('SIGTERM')
  if (!(await waitForExit(child, 3_000)) && child.exitCode === null) {
    child.kill('SIGKILL')
    await waitForExit(child, 2_000)
  }
}

async function stop() {
  if (stopping) {
    return
  }
  stopping = true
  await Promise.all([...children].map(stopChild))
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void stop().then(() => {
      process.exitCode = signal === 'SIGINT' ? 130 : 143
    })
  })
}

let exitCode = 1
try {
  const api = launch([resolve(repositoryRoot, 'apps/api/dist/server.js')], {
    AJANI_DATA_MODE: 'pglite',
    AJANI_PGLITE_DATA_DIR: 'memory://',
    CORS_ALLOWED_ORIGINS: webOrigin,
    HOST: '127.0.0.1',
    LOG_LEVEL: 'warn',
    NODE_ENV: 'test',
    PORT: '43117',
    RATE_LIMIT_MAX: '1000',
    SHUTDOWN_TIMEOUT_MS: '2000',
  })
  await waitForUrl(`${apiOrigin}/ready`, api, 'API')

  const web = launch(
    [
      resolve(repositoryRoot, 'node_modules/vite/bin/vite.js'),
      'preview',
      'apps/web',
      '--host',
      '127.0.0.1',
      '--port',
      '43118',
      '--strictPort',
    ],
    { AJANI_API_PROXY_TARGET: apiOrigin },
  )
  await waitForUrl(`${webOrigin}/health`, web, 'Web preview')

  const playwright = launch(
    [
      resolve(repositoryRoot, 'node_modules/@playwright/test/cli.js'),
      'test',
      ...process.argv.slice(2),
    ],
    { AJANI_E2E_API_ORIGIN: apiOrigin },
  )
  exitCode = await new Promise((resolveExit) => {
    playwright.once('exit', (code) => {
      resolveExit(code ?? 1)
    })
  })
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'E2E verification failed.'}\n`,
  )
} finally {
  await stop()
}

process.exitCode = exitCode
