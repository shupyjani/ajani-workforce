import {
  assertHostedPreviewResetCompatible,
  checkDatabaseReadiness,
  connectDatabase,
  createDrizzlePreviewRepository,
  migrateDatabase,
  parseDatabaseConfig,
  parseHostedPreviewResetConfig,
  resetHostedSyntheticPreviewPostgres,
  resetSyntheticPreview,
  seedSyntheticPreview,
  syntheticPreviewReferenceAt,
  type DatabaseConnection,
} from '@ajani/database'
import { buildApplication } from './app.js'
import { parseEnvironment, type EnvironmentConfig } from './config/environment.js'

type Application = ReturnType<typeof buildApplication>

function writeStartupFailure(error: unknown): void {
  process.stderr.write(
    `${JSON.stringify({
      errorType: error instanceof Error ? error.name : 'UnknownError',
      level: 'fatal',
      message: 'API startup failed',
    })}\n`,
  )
}

function buildLogger(config: EnvironmentConfig) {
  return {
    level: config.logLevel,
    redact: {
      censor: '[Redacted]',
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers.proxy-authorization',
        'req.headers.x-api-key',
        'res.headers.set-cookie',
        '*.databaseUrl',
        '*.password',
        '*.token',
      ],
    },
  }
}

async function closeAfterFatal(
  application: Application,
  config: EnvironmentConfig,
  error: unknown,
  source: 'uncaughtException' | 'unhandledRejection',
): Promise<void> {
  application.log.fatal({ err: error, source }, 'Fatal API runtime error')
  process.exitCode = 1

  const forceCloseTimer = setTimeout(() => {
    application.log.error('Graceful fatal-error shutdown timed out')
    application.server.closeAllConnections()
  }, config.shutdownTimeoutMilliseconds)
  forceCloseTimer.unref()

  try {
    await application.close()
  } catch (closeError: unknown) {
    application.log.error({ err: closeError }, 'Fatal-error shutdown failed')
    application.server.closeAllConnections()
  } finally {
    clearTimeout(forceCloseTimer)
  }
}

function registerProcessLifecycle(
  application: Application,
  config: EnvironmentConfig,
): void {
  let isClosing = false

  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    if (isClosing) {
      return
    }

    isClosing = true
    application.log.info({ signal }, 'Shutting down API')
    const forceCloseTimer = setTimeout(() => {
      application.log.error({ signal }, 'Graceful API shutdown timed out')
      application.server.closeAllConnections()
      process.exitCode = 1
    }, config.shutdownTimeoutMilliseconds)
    forceCloseTimer.unref()

    try {
      await application.close()
    } finally {
      clearTimeout(forceCloseTimer)
    }
  }

  function handleSignal(signal: NodeJS.Signals): void {
    void shutdown(signal).catch((error: unknown) => {
      application.log.error({ err: error, signal }, 'API shutdown failed')
      application.server.closeAllConnections()
      process.exitCode = 1
    })
  }

  function handleFatal(
    error: unknown,
    source: 'uncaughtException' | 'unhandledRejection',
  ): void {
    if (isClosing) {
      return
    }
    isClosing = true
    void closeAfterFatal(application, config, error, source)
  }

  process.once('SIGINT', () => {
    handleSignal('SIGINT')
  })
  process.once('SIGTERM', () => {
    handleSignal('SIGTERM')
  })
  process.once('uncaughtException', (error) => {
    handleFatal(error, 'uncaughtException')
  })
  process.once('unhandledRejection', (reason) => {
    handleFatal(reason, 'unhandledRejection')
  })
}

async function start(): Promise<void> {
  const config = parseEnvironment()
  const databaseConfig = parseDatabaseConfig()
  const hostedPreviewReset = parseHostedPreviewResetConfig()
  // Fails closed before any database connection is opened: a hosted-preview
  // reset armed against the wrong mode is a misconfiguration, not something
  // to silently ignore or silently run anyway.
  assertHostedPreviewResetCompatible(databaseConfig, hostedPreviewReset)
  let connection: DatabaseConnection | undefined
  let application: Application | undefined

  try {
    const activeConnection = await connectDatabase(databaseConfig)
    connection = activeConnection

    if (activeConnection.mode === 'pglite') {
      await migrateDatabase(activeConnection)
      await seedSyntheticPreview(activeConnection)
    } else if (hostedPreviewReset.enabled) {
      // Every hosted cold start or restart gets a clean, deterministic public
      // demonstration. Errors here are deliberately replaced with a fixed,
      // credential-free message before they can reach any logger — postgres.js
      // connection errors can otherwise carry hostnames or other connection
      // detail in `.message`, and pino's field-name redaction (see
      // `buildLogger` below) cannot scrub text embedded inside a message
      // string, only whole fields named exactly like a redaction path.
      try {
        await migrateDatabase(activeConnection)
        await resetHostedSyntheticPreviewPostgres(activeConnection)
      } catch {
        throw new Error('Hosted synthetic preview initialisation failed.')
      }
    }

    // Test-only: an external E2E runner needs to restore the synthetic preview
    // baseline between complete serial-journey attempts. Only ever constructed when
    // running with NODE_ENV=test against a PGlite connection, so development and
    // production builds never gain a reset capability. See app.ts's
    // `testOnlyResetSyntheticPreview` option and `testOnlyResetPreviewRoute`.
    const testOnlyResetSyntheticPreview =
      config.nodeEnv === 'test' && activeConnection.mode === 'pglite'
        ? async (): Promise<void> => {
            await resetSyntheticPreview(activeConnection, {
              confirmPreviewReset: true,
            })
          }
        : undefined

    application = buildApplication({
      bodyLimitBytes: config.bodyLimitBytes,
      clock: () => new Date(syntheticPreviewReferenceAt),
      connectionTimeoutMilliseconds: config.connectionTimeoutMilliseconds,
      corsAllowedOrigins: config.corsAllowedOrigins,
      keepAliveTimeoutMilliseconds: config.keepAliveTimeoutMilliseconds,
      logger: buildLogger(config),
      previewRepository: createDrizzlePreviewRepository(activeConnection),
      rateLimitMax: config.rateLimitMax,
      rateLimitWindowMilliseconds: config.rateLimitWindowMilliseconds,
      readinessCheck: () => checkDatabaseReadiness(activeConnection),
      requestTimeoutMilliseconds: config.requestTimeoutMilliseconds,
      ...(testOnlyResetSyntheticPreview === undefined
        ? {}
        : { testOnlyResetSyntheticPreview }),
      trustProxy: config.trustProxy,
    })

    application.addHook('onClose', async () => {
      await activeConnection.close()
    })
    registerProcessLifecycle(application, config)
    await application.listen({ host: config.host, port: config.port })
  } catch (error: unknown) {
    if (application !== undefined) {
      application.log.fatal({ err: error }, 'API startup failed')
      await application.close().catch(() => undefined)
    } else if (connection !== undefined) {
      await connection.close().catch(() => undefined)
      writeStartupFailure(error)
    } else {
      writeStartupFailure(error)
    }
    process.exitCode = 1
  }
}

await start()
