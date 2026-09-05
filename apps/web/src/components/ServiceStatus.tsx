import { CheckCircle2, RefreshCw, ServerOff, WifiOff } from 'lucide-react'
import {
  useServiceReadiness,
  type ServiceReadinessState,
} from '../hooks/useServiceReadiness'

const startupMessages: Record<
  ServiceReadinessState,
  { readonly detail?: string; readonly headline: string }
> = {
  available: { headline: 'Service connected' },
  connecting: { headline: 'Connecting to preview' },
  delayed: {
    detail: 'You can wait a little longer or try again now.',
    headline: 'The preview service is taking longer than expected',
  },
  offline: {
    detail: 'Some preview data may be unavailable. Try again when connected.',
    headline: 'You appear to be offline',
  },
  starting: {
    detail: 'The first connection can take up to a minute.',
    headline: 'Starting preview service',
  },
}

function StatusIcon({ state }: { readonly state: ServiceReadinessState }) {
  if (state === 'offline') {
    return <WifiOff size={17} />
  }
  if (state === 'delayed') {
    return <ServerOff size={17} />
  }
  if (state === 'available') {
    return <CheckCircle2 size={17} />
  }
  // Reduced-motion viewers get this icon without its animation, so the headline and
  // detail text below carry the progress on their own.
  return <RefreshCw className="spin" size={17} />
}

export function ServiceStatus() {
  const { recovered, retry, state } = useServiceReadiness()
  const { detail, headline } = startupMessages[state]

  return (
    <>
      <section
        className={`network-status network-status--${state}`}
        aria-label="Application service status"
      >
        <span className="network-status__icon" aria-hidden="true">
          <StatusIcon state={state} />
        </span>
        {/*
          One polite region for the whole status. Its text changes only when the
          startup state itself changes, never per poll attempt, so repeated failures
          while the service wakes do not re-announce the same message.
        */}
        <div aria-live="polite">
          <strong>{headline}</strong>
          {detail !== undefined && <span>{detail}</span>}
        </div>
        {state === 'delayed' && (
          <button className="text-button" onClick={retry} type="button">
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
