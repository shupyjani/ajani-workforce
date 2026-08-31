import {
  errorResponseSchema,
  healthResponseSchema,
  healthRoute,
  livenessRoute,
  readinessResponseSchema,
  readinessRoute,
  requestIdHeaderName,
} from '@ajani/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApplication, testOnlyResetPreviewRoute } from '../src/app.js'

const openApplications: ReturnType<typeof buildApplication>[] = []

afterEach(async () => {
  await Promise.all(openApplications.splice(0).map((application) => application.close()))
})

describe('health route', () => {
  it('returns validated health data and preserves a valid correlation ID', async () => {
    const application = buildApplication({ logger: false })
    openApplications.push(application)
    const requestId = '78420e18-2a11-4d8a-bd07-baa4cc7b736f'

    const response = await application.inject({
      headers: { [requestIdHeaderName]: requestId },
      method: 'GET',
      url: healthRoute,
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers[requestIdHeaderName]).toBe(requestId)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(healthResponseSchema.parse(response.json())).toMatchObject({
      requestId,
      service: 'ajani-workforce-api',
      status: 'ok',
    })
  })

  it('replaces an invalid incoming correlation ID', async () => {
    const application = buildApplication({ logger: false })
    openApplications.push(application)

    const response = await application.inject({
      headers: { [requestIdHeaderName]: 'unsafe request id' },
      method: 'GET',
      url: healthRoute,
    })

    const body = healthResponseSchema.parse(response.json())
    expect(body.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(response.headers[requestIdHeaderName]).toBe(body.requestId)
  })

  it('provides separate liveness and dependency-backed readiness contracts', async () => {
    const application = buildApplication({
      logger: false,
      readinessCheck: () => Promise.resolve(),
    })
    openApplications.push(application)

    const [livenessResponse, readinessResponse] = await Promise.all([
      application.inject({ method: 'GET', url: livenessRoute }),
      application.inject({ method: 'GET', url: readinessRoute }),
    ])

    expect(livenessResponse.statusCode).toBe(200)
    expect(healthResponseSchema.parse(livenessResponse.json()).status).toBe('ok')
    expect(readinessResponse.statusCode).toBe(200)
    expect(readinessResponseSchema.parse(readinessResponse.json()).status).toBe(
      'ready',
    )
  })

  it('reports failed dependency readiness without internal details', async () => {
    const application = buildApplication({
      logger: false,
      readinessCheck: () => Promise.reject(new Error('private database path')),
    })
    openApplications.push(application)

    const response = await application.inject({ method: 'GET', url: readinessRoute })

    expect(response.statusCode).toBe(503)
    expect(readinessResponseSchema.parse(response.json()).status).toBe('not_ready')
    expect(response.body).not.toContain('private database path')
  })

  it('applies explicit CORS and bounded preview rate limiting', async () => {
    const application = buildApplication({
      corsAllowedOrigins: ['https://preview.example'],
      logger: false,
      rateLimitMax: 1,
      rateLimitWindowMilliseconds: 60_000,
    })
    openApplications.push(application)
    const previewUrl =
      '/api/v1/preview/workers/30000000-0000-4000-8000-000000000001/overview'

    const allowed = await application.inject({
      headers: { origin: 'https://preview.example' },
      method: 'GET',
      url: previewUrl,
    })
    const limited = await application.inject({
      headers: { origin: 'https://preview.example' },
      method: 'GET',
      url: previewUrl,
    })
    const health = await application.inject({ method: 'GET', url: healthRoute })

    expect(allowed.headers['access-control-allow-origin']).toBe(
      'https://preview.example',
    )
    expect(limited.statusCode).toBe(429)
    expect(errorResponseSchema.parse(limited.json()).error.code).toBe('RATE_LIMITED')
    expect(limited.headers[requestIdHeaderName]).toBeDefined()
    expect(health.statusCode).toBe(200)
  })

  it('does not grant CORS response access to an unconfigured origin', async () => {
    const application = buildApplication({
      corsAllowedOrigins: ['https://preview.example'],
      logger: false,
    })
    openApplications.push(application)

    const response = await application.inject({
      headers: { origin: 'https://untrusted.example' },
      method: 'GET',
      url: healthRoute,
    })

    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('does not expose internal error details', async () => {
    const application = buildApplication({ logger: false })
    openApplications.push(application)
    application.get('/failure', () => {
      throw new Error('synthetic private diagnostic')
    })

    const response = await application.inject({
      method: 'GET',
      url: '/failure',
    })

    expect(response.statusCode).toBe(500)
    const body = errorResponseSchema.parse(response.json())
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR')
    expect(response.body).not.toContain('synthetic private diagnostic')
  })
})

describe('test-only preview reset route', () => {
  it('invokes the supplied reset callback and responds with no content', async () => {
    const testOnlyResetSyntheticPreview = vi.fn().mockResolvedValue(undefined)
    const application = buildApplication({
      logger: false,
      testOnlyResetSyntheticPreview,
    })
    openApplications.push(application)

    const response = await application.inject({
      method: 'POST',
      url: testOnlyResetPreviewRoute,
    })

    expect(response.statusCode).toBe(204)
    expect(testOnlyResetSyntheticPreview).toHaveBeenCalledTimes(1)
  })

  it('is not registered when no reset callback is supplied, matching ordinary development and production use', async () => {
    const application = buildApplication({ logger: false })
    openApplications.push(application)

    const response = await application.inject({
      method: 'POST',
      url: testOnlyResetPreviewRoute,
    })

    expect(response.statusCode).toBe(404)
  })

  it('surfaces a failed reset as a safe 500 without leaking internal detail', async () => {
    const testOnlyResetSyntheticPreview = vi
      .fn()
      .mockRejectedValue(new Error('pglite-only diagnostic'))
    const application = buildApplication({
      logger: false,
      testOnlyResetSyntheticPreview,
    })
    openApplications.push(application)

    const response = await application.inject({
      method: 'POST',
      url: testOnlyResetPreviewRoute,
    })

    expect(response.statusCode).toBe(500)
    const body = errorResponseSchema.parse(response.json())
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR')
    expect(response.body).not.toContain('pglite-only diagnostic')
  })
})
