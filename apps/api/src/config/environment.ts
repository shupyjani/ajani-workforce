import { isIP } from 'node:net'
import { z } from 'zod'

const hostnamePattern = /^(?=.{1,253}$)(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)*[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i

const environmentSchema = z.strictObject({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  HOST: z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) => isIP(value) !== 0 || hostnamePattern.test(value),
      'HOST must be an IP address or valid hostname',
    )
    .default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  TRUST_PROXY: z.enum(['false', 'loopback']).default('false'),
  CORS_ALLOWED_ORIGINS: z.string().default(''),
  BODY_LIMIT_BYTES: z.coerce.number().int().min(1_024).max(1_048_576).default(65_536),
  CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(10_000),
  KEEP_ALIVE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(5_000),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(60_000),
})

type EnvironmentSource = Readonly<Record<string, string | undefined>>

export interface EnvironmentConfig {
  readonly bodyLimitBytes: number
  readonly connectionTimeoutMilliseconds: number
  readonly corsAllowedOrigins: readonly string[]
  readonly host: string
  readonly keepAliveTimeoutMilliseconds: number
  readonly logLevel: z.infer<typeof environmentSchema>['LOG_LEVEL']
  readonly nodeEnv: z.infer<typeof environmentSchema>['NODE_ENV']
  readonly port: number
  readonly rateLimitMax: number
  readonly rateLimitWindowMilliseconds: number
  readonly requestTimeoutMilliseconds: number
  readonly shutdownTimeoutMilliseconds: number
  readonly trustProxy: false | 'loopback'
}

export class EnvironmentConfigurationError extends Error {
  override readonly name = 'EnvironmentConfigurationError'
}

function parseAllowedOrigins(value: string): readonly string[] {
  if (value.trim().length === 0) {
    return []
  }

  return value.split(',').map((candidate) => {
    const origin = candidate.trim()
    let url: URL
    try {
      url = new URL(origin)
    } catch {
      throw new EnvironmentConfigurationError(
        'Invalid API environment configuration: CORS_ALLOWED_ORIGINS must contain HTTP(S) origins separated by commas',
      )
    }

    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.origin !== origin ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      throw new EnvironmentConfigurationError(
        'Invalid API environment configuration: CORS_ALLOWED_ORIGINS must contain exact HTTP(S) origins without paths or credentials',
      )
    }
    return origin
  })
}

export function parseEnvironment(
  source: EnvironmentSource = process.env,
): EnvironmentConfig {
  const result = environmentSchema.safeParse({
    NODE_ENV: source['NODE_ENV'],
    HOST: source['HOST'],
    PORT: source['PORT'],
    LOG_LEVEL: source['LOG_LEVEL'],
    TRUST_PROXY: source['TRUST_PROXY'],
    CORS_ALLOWED_ORIGINS: source['CORS_ALLOWED_ORIGINS'],
    BODY_LIMIT_BYTES: source['BODY_LIMIT_BYTES'],
    CONNECTION_TIMEOUT_MS: source['CONNECTION_TIMEOUT_MS'],
    KEEP_ALIVE_TIMEOUT_MS: source['KEEP_ALIVE_TIMEOUT_MS'],
    REQUEST_TIMEOUT_MS: source['REQUEST_TIMEOUT_MS'],
    SHUTDOWN_TIMEOUT_MS: source['SHUTDOWN_TIMEOUT_MS'],
    RATE_LIMIT_MAX: source['RATE_LIMIT_MAX'],
    RATE_LIMIT_WINDOW_MS: source['RATE_LIMIT_WINDOW_MS'],
  })

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')

    throw new EnvironmentConfigurationError(
      `Invalid API environment configuration: ${details}`,
    )
  }

  const defaultOrigins =
    result.data.NODE_ENV === 'production'
      ? []
      : ['http://127.0.0.1:5173', 'http://localhost:5173']
  const configuredOrigins = parseAllowedOrigins(result.data.CORS_ALLOWED_ORIGINS)

  return {
    bodyLimitBytes: result.data.BODY_LIMIT_BYTES,
    connectionTimeoutMilliseconds: result.data.CONNECTION_TIMEOUT_MS,
    corsAllowedOrigins:
      configuredOrigins.length === 0 ? defaultOrigins : configuredOrigins,
    host: result.data.HOST,
    keepAliveTimeoutMilliseconds: result.data.KEEP_ALIVE_TIMEOUT_MS,
    logLevel: result.data.LOG_LEVEL,
    nodeEnv: result.data.NODE_ENV,
    port: result.data.PORT,
    rateLimitMax: result.data.RATE_LIMIT_MAX,
    rateLimitWindowMilliseconds: result.data.RATE_LIMIT_WINDOW_MS,
    requestTimeoutMilliseconds: result.data.REQUEST_TIMEOUT_MS,
    shutdownTimeoutMilliseconds: result.data.SHUTDOWN_TIMEOUT_MS,
    trustProxy: result.data.TRUST_PROXY === 'loopback' ? 'loopback' : false,
  }
}
