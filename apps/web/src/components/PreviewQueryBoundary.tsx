import type { UseQueryResult } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ApiRequestError } from '../api/client'
import { ErrorState, OfflineState, Skeleton } from './ui/States'

export function PreviewQueryBoundary<T>({
  children,
  query,
  skeletonLines = 4,
}: {
  readonly children: (data: T) => ReactNode
  readonly query: UseQueryResult<T>
  readonly skeletonLines?: number
}) {
  const encounteredError = useRef(false)
  const [recovered, setRecovered] = useState(false)

  useEffect(() => {
    if (query.isError) {
      encounteredError.current = true
      return undefined
    }

    if (query.data !== undefined && encounteredError.current) {
      encounteredError.current = false
      setRecovered(true)
      const timer = window.setTimeout(() => {
        setRecovered(false)
      }, 4_000)
      return () => {
        window.clearTimeout(timer)
      }
    }

    return undefined
  }, [query.data, query.isError])

  const retry = () => {
    void query.refetch()
  }
  const offline =
    query.fetchStatus === 'paused' ||
    (query.error instanceof ApiRequestError && query.error.code === 'OFFLINE')

  if (offline && query.data === undefined) {
    return <OfflineState onRetry={retry} />
  }

  if (query.isPending) {
    return (
      <section className="card">
        <Skeleton lines={skeletonLines} />
      </section>
    )
  }

  if (query.isError) {
    return (
      <ErrorState
        description="The synthetic preview could not be loaded. No workforce data has been changed."
        onRetry={retry}
        title="Preview data is temporarily unavailable"
      />
    )
  }

  return (
    <>
      {query.isFetching && (
        <span className="visually-hidden" role="status">
          Refreshing synthetic preview data
        </span>
      )}
      {children(query.data)}
      {recovered && (
        <div className="toast" role="status">
          <CheckCircle2 aria-hidden="true" size={19} />
          Synthetic preview data loaded
        </div>
      )}
    </>
  )
}

export function PreviewDataSource({ generatedAt }: { readonly generatedAt: string }) {
  return (
    <p className="preview-data-source">
      <CheckCircle2 aria-hidden="true" size={15} />
      Synthetic preview data
      <span aria-hidden="true">·</span>
      <span>API-backed scenario</span>
      <time className="visually-hidden" dateTime={generatedAt}>
        Generated {generatedAt}
      </time>
    </p>
  )
}
