import { QueryClient } from '@tanstack/react-query'
import { ApiRequestError } from './client'

export const previewStaleTimeMilliseconds = 60_000
export const previewRetryLimit = 2

function shouldRetry(failureCount: number, error: Error): boolean {
  if (failureCount >= previewRetryLimit) {
    return false
  }

  if (error instanceof ApiRequestError) {
    return error.status === 0 || error.status === 408 || error.status >= 500
  }

  return false
}

export function createAjaniQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 5 * 60_000,
        networkMode: 'online',
        refetchOnReconnect: true,
        refetchOnWindowFocus: false,
        retry: shouldRetry,
        staleTime: previewStaleTimeMilliseconds,
      },
    },
  })
}
