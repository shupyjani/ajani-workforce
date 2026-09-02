import { livenessRoute } from '@ajani/contracts'
import { useEffect, useRef } from 'react'
import { apiUrl } from '../api/client'

/**
 * Fires one best-effort GET against the liveness route to start waking a sleeping
 * preview API as soon as the landing page opens, without blocking or destabilising
 * the initial render. The ref guard (rather than an abort-on-unmount cleanup) keeps
 * this to a single request even across React Strict Mode's double-invoked effects,
 * since aborting would cancel the one request the double-invoke is meant to dedupe.
 * Failure is expected when the preview API is asleep or unreachable and is safely
 * discarded here; it never surfaces as a console warning or error.
 */
export function useApiWakeUp(): void {
  const hasRequested = useRef(false)

  useEffect(() => {
    if (hasRequested.current) {
      return
    }
    hasRequested.current = true

    void fetch(apiUrl(livenessRoute), {
      credentials: 'omit',
      headers: { accept: 'application/json' },
    }).catch(() => undefined)
  }, [])
}
