import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const defaultPgliteDataDirectory = fileURLToPath(
  new URL('../../../.ajani-data/pglite', import.meta.url),
)

const dataModeSchema = z.enum(['pglite', 'postgres'])
const directorySchema = z.string().trim().min(1)
const databaseUrlSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    try {
      const url = new URL(value)
      return url.protocol === 'postgres:' || url.protocol === 'postgresql:'
    } catch {
      return false
    }
  }, 'DATABASE_URL must be a valid postgres:// or postgresql:// URL')

export type DataMode = z.infer<typeof dataModeSchema>

export type DatabaseConfig =
  | {
      readonly mode: 'pglite'
      readonly dataDirectory: string
    }
  | {
      readonly mode: 'postgres'
      readonly databaseUrl: string
    }

export type DatabaseEnvironmentSource = Readonly<
  Record<string, string | undefined>
>

export class DatabaseConfigurationError extends Error {
  public override readonly name = 'DatabaseConfigurationError'
}

function configurationError(error: z.ZodError): DatabaseConfigurationError {
  const issue = error.issues[0]
  if (issue === undefined) {
    return new DatabaseConfigurationError('Invalid database configuration.')
  }
  return new DatabaseConfigurationError(
    `Invalid database configuration: ${issue.path.join('.')}: ${issue.message}`,
  )
}

export function parseDatabaseConfig(
  source: DatabaseEnvironmentSource = process.env,
): DatabaseConfig {
  const modeResult = dataModeSchema.safeParse(source['AJANI_DATA_MODE'] ?? 'pglite')
  if (!modeResult.success) {
    throw configurationError(modeResult.error)
  }

  if (modeResult.data === 'postgres') {
    const urlResult = databaseUrlSchema.safeParse(source['DATABASE_URL'])
    if (!urlResult.success) {
      throw configurationError(urlResult.error)
    }

    return { databaseUrl: urlResult.data, mode: 'postgres' }
  }

  const directoryResult = directorySchema.safeParse(
    source['AJANI_PGLITE_DATA_DIR'] ?? defaultPgliteDataDirectory,
  )
  if (!directoryResult.success) {
    throw configurationError(directoryResult.error)
  }

  return {
    dataDirectory:
      directoryResult.data === 'memory://' || isAbsolute(directoryResult.data)
        ? directoryResult.data
        : resolve(directoryResult.data),
    mode: 'pglite',
  }
}

export { defaultPgliteDataDirectory }
