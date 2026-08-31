import { randomUUID } from 'node:crypto'
import {
  errorResponseSchema,
  healthResponseSchema,
  healthRoute,
  livenessRoute,
  readinessResponseSchema,
  readinessRoute,
  requestIdHeaderName,
} from '@ajani/contracts'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import fastify, { LogController, type FastifyServerOptions } from 'fastify'
import { z } from 'zod'
import { ApiRequestError } from './errors/api-errors.js'
import {
  unavailablePreviewRepository,
  type PreviewRepository,
} from './repositories/preview-repository.js'
import { registerPreviewRoutes } from './routes/preview-routes.js'
import { PreviewService } from './services/preview-service.js'

const incomingRequestIdSchema = z.uuid()

export interface BuildApplicationOptions {
  readonly bodyLimitBytes?: number
  readonly clock?: () => Date
  readonly connectionTimeoutMilliseconds?: number
  readonly corsAllowedOrigins?: readonly string[]
  readonly keepAliveTimeoutMilliseconds?: number
  readonly logger?: FastifyServerOptions['logger']
  readonly previewRepository?: PreviewRepository
  readonly rateLimitMax?: number
  readonly rateLimitWindowMilliseconds?: number
  readonly readinessCheck?: () => Promise<void>
  readonly requestTimeoutMilliseconds?: number
  /**
   * Test-only hook. When supplied, registers {@link testOnlyResetPreviewRoute} so an
   * external E2E runner can restore the synthetic preview baseline between complete
   * serial-journey attempts. Absent by default, so ordinary development and production
   * use never expose a reset capability. The caller (`server.ts`) must only supply this
   * when running with `NODE_ENV=test` against a PGlite connection.
   */
  readonly testOnlyResetSyntheticPreview?: () => Promise<void>
  readonly trustProxy?: false | 'loopback'
}

/**
 * Registered only when `BuildApplicationOptions.testOnlyResetSyntheticPreview` is
 * supplied. Must stay out of `@ajani/contracts` and out of any route documented as
 * part of the versioned preview API.
 */
export const testOnlyResetPreviewRoute = '/internal/test/reset-preview'

function generateRequestId(request: { headers: Record<string, unknown> }): string {
  const candidate = request.headers[requestIdHeaderName]
  const result = incomingRequestIdSchema.safeParse(candidate)

  return result.success ? result.data : randomUUID()
}

export function buildApplication(options: BuildApplicationOptions = {}) {
  const clock = options.clock ?? (() => new Date())
  const application = fastify({
    bodyLimit: options.bodyLimitBytes ?? 65_536,
    connectionTimeout: options.connectionTimeoutMilliseconds ?? 10_000,
    genReqId: generateRequestId,
    keepAliveTimeout: options.keepAliveTimeoutMilliseconds ?? 5_000,
    logController: new LogController({ disableRequestLogging: true }),
    logger: options.logger ?? true,
    requestTimeout: options.requestTimeoutMilliseconds ?? 15_000,
    trustProxy: options.trustProxy ?? false,
  })

  application.addHook('onRequest', (request, reply, done) => {
    reply.headers({
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'permissions-policy': 'camera=(), geolocation=(), microphone=()',
      'referrer-policy': 'no-referrer',
      [requestIdHeaderName]: request.id,
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
    })
    done()
  })

  void application.register(cors, {
    allowedHeaders: [
      'accept',
      'content-type',
      'idempotency-key',
      requestIdHeaderName,
    ],
    credentials: false,
    exposedHeaders: [
      requestIdHeaderName,
      'ratelimit-limit',
      'ratelimit-remaining',
      'ratelimit-reset',
      'retry-after',
    ],
    maxAge: 600,
    methods: ['GET', 'PATCH', 'POST', 'PUT', 'OPTIONS'],
    origin: [...(options.corsAllowedOrigins ?? [])],
    strictPreflight: true,
  })

  const livenessHandler = (request: { readonly id: string }) =>
    healthResponseSchema.parse({
      status: 'ok',
      service: 'ajani-workforce-api',
      timestamp: new Date().toISOString(),
      requestId: request.id,
    })

  application.get(healthRoute, livenessHandler)
  application.get(livenessRoute, livenessHandler)

  application.get(readinessRoute, async (request, reply) => {
    try {
      await (options.readinessCheck ?? (() => Promise.resolve()))()
      return readinessResponseSchema.parse({
        status: 'ready',
        service: 'ajani-workforce-api',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      })
    } catch {
      request.log.warn(
        { requestId: request.id },
        'Application dependency readiness check failed',
      )
      return reply.status(503).send(
        readinessResponseSchema.parse({
          status: 'not_ready',
          service: 'ajani-workforce-api',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        }),
      )
    }
  })

  void application.register(async (previewApplication) => {
    await previewApplication.register(rateLimit, {
      enableDraftSpec: true,
      global: true,
      max: options.rateLimitMax ?? 120,
      timeWindow: options.rateLimitWindowMilliseconds ?? 60_000,
    })
    registerPreviewRoutes(previewApplication, {
      clock,
      service: new PreviewService(
        options.previewRepository ?? unavailablePreviewRepository,
        clock,
      ),
    })
  })

  const testOnlyResetSyntheticPreview = options.testOnlyResetSyntheticPreview
  if (testOnlyResetSyntheticPreview !== undefined) {
    application.post(testOnlyResetPreviewRoute, async (_request, reply) => {
      await testOnlyResetSyntheticPreview()
      return reply.status(204).send()
    })
  }

  application.addHook('onResponse', (request, reply, done) => {
    request.log.info(
      {
        method: request.method,
        requestId: request.id,
        route: request.routeOptions.url,
        statusCode: reply.statusCode,
      },
      'Request completed',
    )
    done()
  })

  application.setNotFoundHandler((request, reply) => {
    reply.status(404).send(
      errorResponseSchema.parse({
        error: {
          code: 'NOT_FOUND',
          message: 'The requested resource was not found.',
          requestId: request.id,
        },
      }),
    )
  })

  application.setErrorHandler((error, request, reply) => {
    const isFastifyValidationError =
      typeof error === 'object' && error !== null && 'validation' in error
    const isRateLimitError =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      error.statusCode === 429
    const statusCode =
      error instanceof ApiRequestError
        ? error.statusCode
        : isRateLimitError
          ? 429
        : isFastifyValidationError
          ? 400
          : 500
    const code =
      error instanceof ApiRequestError
        ? error.code
        : isRateLimitError
          ? 'RATE_LIMITED'
        : statusCode === 400
          ? 'INVALID_REQUEST'
          : 'INTERNAL_SERVER_ERROR'
    const message =
      error instanceof ApiRequestError
        ? error.userMessage
        : isRateLimitError
          ? 'Too many preview requests. Please wait before trying again.'
        : statusCode === 400
          ? 'The request contains invalid values.'
          : 'An unexpected error occurred.'
    const details =
      error instanceof ApiRequestError ? error.details : undefined

    request.log.error(
      {
        errorCode: code,
        errorType:
          error instanceof ApiRequestError
            ? 'handled-request-error'
            : isRateLimitError
              ? 'rate-limit-error'
            : isFastifyValidationError
              ? 'framework-validation-error'
              : 'unhandled-error',
        method: request.method,
        requestId: request.id,
        route: request.routeOptions.url,
        statusCode,
      },
      'Request failed',
    )

    if (statusCode === 503) {
      reply.header('retry-after', '5')
    }

    reply.status(statusCode).send(
      errorResponseSchema.parse({
        error: {
          code,
          ...(details === undefined ? {} : { details }),
          message,
          requestId: request.id,
        },
      }),
    )
  })

  return application
}
