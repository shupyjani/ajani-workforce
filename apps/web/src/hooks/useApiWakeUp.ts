import { livenessRoute } from '@ajani/contracts'
import { useEffect, useRef } from 'react'
import { apiUrl } from '../api/client'

/**
 * Upper bound on the best-effort wake-up request. A sleeping preview API holds the
 * connection open while it starts, so without this the request could stay pending for
 * the whole cold start. Nothing waits on the result — the bound exists so the request
 * cannot outlive its usefulness, not so a caller can react to it.
 */
export const wakeUpRequestTimeoutMilliseconds = 15_000

/**
 * Fires one best-effort GET against the liveness route to start waking a sleeping
 * preview API as early as possible, without blocking or destabilising the initial
 * render. Mounted once in `App` so every browser entry point gets the same head start:
 * the landing page, each role workspace, and any direct or deep-link entry.
 *
 * The ref guard (rather than an abort-on-unmount cleanup) keeps this to a single
 * request even across React Strict Mode's double-invoked effects, since aborting on
 * unmount would cancel the one request the double-invoke is meant to dedupe. The
 * timeout below is therefore the only thing that aborts it.
 *
 * Failure is expected when the preview API is asleep or unreachable, and a timeout is
 * not a failure worth reporting: both are discarded here and never surface as a
 * console warning, an error, or a visible state. Readiness is reported separately by
 * `useServiceReadiness`, which polls the database-backed `/ready` route.
 */
export function useApiWakeUp(): void {
  const hasRequested = useRef(false)

  useEffect(() => {
    if (hasRequested.current) {
      return
    }
    hasRequested.current = true

    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      controller.abort()
    }, wakeUpRequestTimeoutMilliseconds)

    void fetch(apiUrl(livenessRoute), {
      credentials: 'omit',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
      .catch(() => undefined)
      .finally(() => {
        window.clearTimeout(timeout)
      })
  }, [])
}
