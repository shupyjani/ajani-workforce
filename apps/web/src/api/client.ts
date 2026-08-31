import { errorResponseSchema } from '@ajani/contracts'

interface RuntimeSchema<T> {
  readonly parse: (input: unknown) => T
}

const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(
  /\/$/,
  '',
)

export class ApiRequestError extends Error {
  public readonly code: string
  public readonly requestId: string | undefined
  public readonly status: number

  public constructor({
    code,
    message,
    requestId,
    status,
  }: {
    readonly code: string
    readonly message: string
    readonly requestId: string | undefined
    readonly status: number
  }) {
    super(message)
    this.name = 'ApiRequestError'
    this.code = code
    this.requestId = requestId
    this.status = status
  }
}

function apiUrl(path: string): string {
  return `${configuredApiBaseUrl}${path}`
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new ApiRequestError({
      code: 'INVALID_RESPONSE',
      message: 'The preview service returned an unreadable response.',
      requestId: undefined,
      status: response.status,
    })
  }
}

export async function getApiResponse<T>({
  path,
  schema,
  signal,
}: {
  readonly path: string
  readonly schema: RuntimeSchema<T>
  readonly signal: AbortSignal
}): Promise<T> {
  let response: Response

  try {
    response = await fetch(apiUrl(path), {
      headers: { accept: 'application/json' },
      signal,
    })
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    throw new ApiRequestError({
      code: navigator.onLine ? 'NETWORK_UNAVAILABLE' : 'OFFLINE',
      message: navigator.onLine
        ? 'The preview service could not be reached.'
        : 'You appear to be offline.',
      requestId: undefined,
      status: 0,
    })
  }

  const payload = await readJson(response)

  if (!response.ok) {
    const parsedError = errorResponseSchema.safeParse(payload)
    throw new ApiRequestError({
      code: parsedError.success ? parsedError.data.error.code : 'REQUEST_FAILED',
      message: parsedError.success
        ? parsedError.data.error.message
        : 'The preview request could not be completed.',
      requestId: parsedError.success
        ? parsedError.data.error.requestId
        : response.headers.get('x-request-id') ?? undefined,
      status: response.status,
    })
  }

  try {
    return schema.parse(payload)
  } catch {
    throw new ApiRequestError({
      code: 'INVALID_RESPONSE',
      message: 'The preview service returned an unexpected response.',
      requestId: response.headers.get('x-request-id') ?? undefined,
      status: response.status,
    })
  }
}

export async function mutateApiResponse<T>({
  body,
  idempotencyKey,
  method,
  path,
  schema,
}: {
  readonly body: unknown
  readonly idempotencyKey: string
  readonly method: 'PATCH' | 'POST' | 'PUT'
  readonly path: string
  readonly schema: RuntimeSchema<T>
}): Promise<T> {
  let response: Response

  try {
    response = await fetch(apiUrl(path), {
      body: JSON.stringify(body),
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      method,
    })
  } catch {
    throw new ApiRequestError({
      code: navigator.onLine ? 'NETWORK_UNAVAILABLE' : 'OFFLINE',
      message: navigator.onLine
        ? 'The preview service could not be reached.'
        : 'You appear to be offline.',
      requestId: undefined,
      status: 0,
    })
  }

  const payload = await readJson(response)

  if (!response.ok) {
    const parsedError = errorResponseSchema.safeParse(payload)
    throw new ApiRequestError({
      code: parsedError.success ? parsedError.data.error.code : 'REQUEST_FAILED',
      message: parsedError.success
        ? parsedError.data.error.message
        : 'The preview request could not be completed.',
      requestId: parsedError.success
        ? parsedError.data.error.requestId
        : response.headers.get('x-request-id') ?? undefined,
      status: response.status,
    })
  }

  try {
    return schema.parse(payload)
  } catch {
    throw new ApiRequestError({
      code: 'INVALID_RESPONSE',
      message: 'The preview service returned an unexpected response.',
      requestId: response.headers.get('x-request-id') ?? undefined,
      status: response.status,
    })
  }
}

export async function postApiResponse<T>(options: Omit<Parameters<typeof mutateApiResponse<T>>[0], 'method'>): Promise<T> {
  return mutateApiResponse({ ...options, method: 'POST' })
}
