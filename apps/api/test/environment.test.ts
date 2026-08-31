import { describe, expect, it } from 'vitest'
import {
  EnvironmentConfigurationError,
  parseEnvironment,
} from '../src/config/environment.js'

describe('API environment configuration', () => {
  it('provides safe local defaults', () => {
    expect(parseEnvironment({})).toEqual({
      bodyLimitBytes: 65_536,
      connectionTimeoutMilliseconds: 10_000,
      corsAllowedOrigins: [
        'http://127.0.0.1:5173',
        'http://localhost:5173',
      ],
      host: '127.0.0.1',
      keepAliveTimeoutMilliseconds: 5_000,
      logLevel: 'info',
      nodeEnv: 'development',
      port: 3000,
      rateLimitMax: 120,
      rateLimitWindowMilliseconds: 60_000,
      requestTimeoutMilliseconds: 15_000,
      shutdownTimeoutMilliseconds: 10_000,
      trustProxy: false,
    })
  })

  it('parses a valid explicit configuration', () => {
    expect(
      parseEnvironment({
        HOST: '0.0.0.0',
        BODY_LIMIT_BYTES: '32768',
        CONNECTION_TIMEOUT_MS: '9000',
        CORS_ALLOWED_ORIGINS: 'https://preview.example,https://admin.example',
        KEEP_ALIVE_TIMEOUT_MS: '4000',
        LOG_LEVEL: 'warn',
        NODE_ENV: 'production',
        PORT: '4100',
        RATE_LIMIT_MAX: '80',
        RATE_LIMIT_WINDOW_MS: '30000',
        REQUEST_TIMEOUT_MS: '12000',
        SHUTDOWN_TIMEOUT_MS: '8000',
        TRUST_PROXY: 'loopback',
      }),
    ).toEqual({
      bodyLimitBytes: 32_768,
      connectionTimeoutMilliseconds: 9_000,
      corsAllowedOrigins: [
        'https://preview.example',
        'https://admin.example',
      ],
      host: '0.0.0.0',
      keepAliveTimeoutMilliseconds: 4_000,
      logLevel: 'warn',
      nodeEnv: 'production',
      port: 4100,
      rateLimitMax: 80,
      rateLimitWindowMilliseconds: 30_000,
      requestTimeoutMilliseconds: 12_000,
      shutdownTimeoutMilliseconds: 8_000,
      trustProxy: 'loopback',
    })
  })

  it('defaults production CORS to same-origin only', () => {
    expect(parseEnvironment({ NODE_ENV: 'production' }).corsAllowedOrigins).toEqual(
      [],
    )
  })

  it.each([
    'https://preview.example/path',
    'javascript:alert(1)',
    'https://user:password@preview.example',
  ])('rejects unsafe CORS origin configuration %s', (origin) => {
    expect(() => parseEnvironment({ CORS_ALLOWED_ORIGINS: origin })).toThrow(
      EnvironmentConfigurationError,
    )
  })

  it('fails before startup when configuration is invalid', () => {
    expect(() => parseEnvironment({ HOST: 'not a host!', PORT: '70000' })).toThrow(
      EnvironmentConfigurationError,
    )
  })
})
