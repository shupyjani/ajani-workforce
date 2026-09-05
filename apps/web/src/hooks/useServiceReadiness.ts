import { readinessResponseSchema, readinessRoute } from '@ajani/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiUrl } from '../api/client'
import { previewQueryKeys } from '../api/previewQueries'

/**
 * `connecting` is the opening state and says nothing about the service yet.
 * `starting` is entered once a readiness attempt has actually failed or timed out, so
 * the wait is only explained after there is something to explain. `delayed` is entered
 * when the whole startup passes its ceiling and the visitor deserves a way out.
 */
export type ServiceReadinessState =
  | 'connecting'
  | 'starting'
  | 'delayed'
  | 'available'
  | 'offline'

/**
 * Each readiness attempt is abandoned after this long. A sleeping preview API holds
 * the connection open while it starts, so an unbounded request is what previously
 * left the status stuck on its opening message with no way to progress.
 */
export const readinessRequestTimeoutMilliseconds = 8_000

/**
 * Minimum gap between the end of one attempt and the start of the next. Measured from
 * completion rather than from the start of the previous attempt, so a slow attempt can
 * never overlap the one that follows it.
 */
export const readinessPollIntervalMilliseconds = 5_000

/**
 * How long startup may run before the visitor is told it is taking longer than
 * expected and offered a manual retry. Matches the up-to-a-minute expectation the
 * landing page already sets, so passing it is genuinely worth reporting.
 */
export const startupCeilingMilliseconds = 60_000

/** How long the recovery confirmation stays on screen once readiness returns. */
export const recoveryNoticeMilliseconds = 4_000

export interface ServiceReadiness {
  /** True only just after readiness returns following a startup or offline gap. */
  readonly recovered: boolean
  /** Restarts the bounded cycle: a fresh ceiling and an immediate attempt. */
  readonly retry: () => void
  readonly state: ServiceReadinessState
}

async function requestReadiness(signal: AbortSignal): Promise<void> {
  const response = await fetch(apiUrl(readinessRoute), {
    headers: { accept: 'application/json' },
    signal,
  })

  if (!response.ok) {
    throw new Error('Readiness request failed')
  }

  const payload = readinessResponseSchema.parse(await response.json())

  if (payload.status !== 'ready') {
    throw new Error('Service is not ready')
  }
}

/**
 * Polls the database-backed readiness route on a bounded, non-overlapping cycle and
 * reports one startup state. `/ready` rather than `/health` deliberately: `/health`
 * and `/live` share one in-process handler and answer before the database does, so
 * they cannot tell a visitor whether preview data will actually load.
 *
 * Polling stops the moment readiness returns, the browser goes offline, or the caller
 * unmounts. When readiness returns after a gap, mounted preview queries are refetched
 * so panels that failed during startup heal without the visitor retrying each one.
 */
export function useServiceReadiness(): ServiceReadiness {
  const queryClient = useQueryClient()
  const [online, setOnline] = useState<boolean>(() => navigator.onLine)
  const [state, setState] = useState<ServiceReadinessState>(() =>
    navigator.onLine ? 'connecting' : 'offline',
  )
  const [cycle, setCycle] = useState(0)
  const [recovered, setRecovered] = useState(false)
  /**
   * Whether this session has already been through a startup or offline gap. Keeps a
   * warm first load quiet: no recovery notice, and no refetch of queries that are
   * loading perfectly well on their own.
   */
  const interrupted = useRef(false)
  /**
   * The controller for the cycle currently running. Held in a ref so an offline
   * transition can end that cycle synchronously, inside the event itself. React runs
   * the effect cleanup on a later commit, which is late enough for an already-issued
   * readiness response to resolve first and overwrite the offline state.
   */
  const activeCycle = useRef<AbortController | null>(null)

  const retry = useCallback(() => {
    if (!navigator.onLine) {
      activeCycle.current?.abort()
      interrupted.current = true
      setOnline(false)
      setState('offline')
      return
    }

    setOnline(true)
    setState('connecting')
    setCycle((currentCycle) => currentCycle + 1)
  }, [])

  useEffect(() => {
    function handleOffline(): void {
      activeCycle.current?.abort()
      interrupted.current = true
      setOnline(false)
      setState('offline')
    }

    function handleOnline(): void {
      setOnline(true)
      setState('connecting')
      setCycle((currentCycle) => currentCycle + 1)
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  useEffect(() => {
    if (!online) {
      return undefined
    }

    // One controller for the whole cycle, and the single signal that the cycle is
    // over — for the in-flight request and for every branch below. Aborted by this
    // effect's cleanup, and synchronously by an offline transition via `activeCycle`.
    const lifecycle = new AbortController()
    // Read through a call rather than the property directly: the compiler otherwise
    // narrows `aborted` to false after the first check and flags every later guard.
    const cancelled = (): boolean => lifecycle.signal.aborted
    activeCycle.current = lifecycle
    let activeController: AbortController | undefined
    let requestTimer: number | undefined
    let pollTimer: number | undefined

    const ceilingTimer = window.setTimeout(() => {
      if (cancelled()) {
        return
      }
      setState((current) => (current === 'available' ? current : 'delayed'))
    }, startupCeilingMilliseconds)

    async function attempt(): Promise<void> {
      if (cancelled()) {
        return
      }

      const controller = new AbortController()
      activeController = controller
      requestTimer = window.setTimeout(() => {
        controller.abort()
      }, readinessRequestTimeoutMilliseconds)

      try {
        await requestReadiness(controller.signal)
        if (cancelled()) {
          return
        }

        window.clearTimeout(ceilingTimer)
        setState('available')

        if (interrupted.current) {
          interrupted.current = false
          setRecovered(true)
          // Scoped to the preview key root and to mounted queries only: this heals the
          // panels the visitor is actually looking at, and leaves everything else —
          // including unrelated keys and background queries — untouched. Per-key
          // deduplication in TanStack Query keeps this to one request per key.
          void queryClient.refetchQueries({
            queryKey: previewQueryKeys.all,
            type: 'active',
          })
        }
        return
      } catch {
        if (cancelled()) {
          return
        }
        interrupted.current = true
        setState((current) => (current === 'delayed' ? current : 'starting'))
      } finally {
        window.clearTimeout(requestTimer)
        requestTimer = undefined
        activeController = undefined
      }

      if (cancelled()) {
        return
      }

      pollTimer = window.setTimeout(() => {
        void attempt()
      }, readinessPollIntervalMilliseconds)
    }

    void attempt()

    return () => {
      if (activeCycle.current === lifecycle) {
        activeCycle.current = null
      }
      lifecycle.abort()
      activeController?.abort()
      window.clearTimeout(ceilingTimer)
      if (requestTimer !== undefined) {
        window.clearTimeout(requestTimer)
      }
      if (pollTimer !== undefined) {
        window.clearTimeout(pollTimer)
      }
    }
  }, [cycle, online, queryClient])

  useEffect(() => {
    if (!recovered) {
      return undefined
    }

    const timer = window.setTimeout(() => {
      setRecovered(false)
    }, recoveryNoticeMilliseconds)
    return () => {
      window.clearTimeout(timer)
    }
  }, [recovered])

  return { recovered, retry, state }
}
