import { healthResponseSchema, healthRoute } from '@ajani/contracts'
import { CheckCircle2, RefreshCw, ServerOff, WifiOff } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

export type ServiceState = 'checking' | 'available' | 'unavailable' | 'offline'

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const recoveryDelayMilliseconds = 10_000

async function checkService(signal: AbortSignal): Promise<void> {
  const response = await fetch(`${apiBaseUrl}${healthRoute}`, {
    headers: { accept: 'application/json' },
    signal,
  })

  if (!response.ok) {
    throw new Error('Health request failed')
  }

  healthResponseSchema.parse(await response.json())
}

export function ServiceStatus() {
  const [attempt, setAttempt] = useState(0)
  const [serviceState, setServiceState] = useState<ServiceState>(
    navigator.onLine ? 'checking' : 'offline',
  )
  const previousState = useRef<ServiceState>(serviceState)
  const [recovered, setRecovered] = useState(false)

  const retryConnection = useCallback(() => {
    if (!navigator.onLine) {
      setServiceState('offline')
      return
    }

    setServiceState('checking')
    setAttempt((currentAttempt) => currentAttempt + 1)
  }, [])

  useEffect(() => {
    function handleOffline(): void {
      setServiceState('offline')
    }

    function handleOnline(): void {
      retryConnection()
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [retryConnection])

  useEffect(() => {
    if (!navigator.onLine) {
      return undefined
    }

    const controller = new AbortController()
    let recoveryTimer: number | undefined

    void checkService(controller.signal)
      .then(() => {
        if (
          previousState.current === 'unavailable' ||
          previousState.current === 'offline'
        ) {
          setRecovered(true)
          window.setTimeout(() => { setRecovered(false); }, 4_000)
        }
        previousState.current = 'available'
        setServiceState('available')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        previousState.current = 'unavailable'
        setServiceState('unavailable')
        recoveryTimer = window.setTimeout(() => {
          setServiceState('checking')
          setAttempt((currentAttempt) => currentAttempt + 1)
        }, recoveryDelayMilliseconds)
      })

    return () => {
      controller.abort()
      if (recoveryTimer !== undefined) {
        window.clearTimeout(recoveryTimer)
      }
    }
  }, [attempt])

  return (
    <>
      <section
        className={`network-status network-status--${serviceState}`}
        aria-label="Application service status"
      >
        <span className="network-status__icon" aria-hidden="true">
          {serviceState === 'offline' ? (
            <WifiOff size={17} />
          ) : serviceState === 'unavailable' ? (
            <ServerOff size={17} />
          ) : serviceState === 'available' ? (
            <CheckCircle2 size={17} />
          ) : (
            <RefreshCw className="spin" size={17} />
          )}
        </span>
        <div aria-live="polite">
          <strong>
            {serviceState === 'checking' && 'Checking service connection'}
            {serviceState === 'available' && 'Service connected'}
            {serviceState === 'unavailable' && 'Service temporarily unavailable'}
            {serviceState === 'offline' && 'You appear to be offline'}
          </strong>
          {(serviceState === 'unavailable' || serviceState === 'offline') && (
            <span>Some preview data may be unavailable. Try again when connected.</span>
          )}
        </div>
        {serviceState === 'unavailable' && (
          <button className="text-button" onClick={retryConnection} type="button">
            Retry now
          </button>
        )}
      </section>
      {recovered && (
        <div className="toast" role="status">
          <CheckCircle2 aria-hidden="true" size={19} />
          Service connection restored
        </div>
      )}
    </>
  )
}
