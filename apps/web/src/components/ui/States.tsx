import { CircleAlert, Inbox, RotateCw, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'

export function Skeleton({ lines = 3 }: { readonly lines?: number }) {
  return (
    <div aria-label="Loading preview data" className="skeleton" role="status">
      <span className="skeleton__block skeleton__block--title" />
      {Array.from({ length: lines }, (_, index) => (
        <span className="skeleton__block" key={index} />
      ))}
    </div>
  )
}

export function EmptyState({
  action,
  description,
  title,
}: {
  readonly action?: ReactNode
  readonly description: string
  readonly title: string
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon">
        <Inbox aria-hidden="true" size={22} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}

export function ErrorState({
  description,
  onRetry,
  title,
}: {
  readonly description: string
  readonly onRetry?: () => void
  readonly title: string
}) {
  return (
    <div className="error-state" role="alert">
      <CircleAlert aria-hidden="true" size={24} />
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
        {onRetry === undefined ? null : (
          <button className="button button--secondary button--small" onClick={onRetry} type="button">
            <RotateCw aria-hidden="true" size={16} />
            Try again
          </button>
        )}
      </div>
    </div>
  )
}

export function OfflineState({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <div className="error-state error-state--offline" role="status">
      <WifiOff aria-hidden="true" size={24} />
      <div>
        <h3>You appear to be offline</h3>
        <p>
          Reconnect to load this synthetic preview. Ajani will also retry when
          your connection returns.
        </p>
        <button
          className="button button--secondary button--small"
          onClick={onRetry}
          type="button"
        >
          <RotateCw aria-hidden="true" size={16} />
          Retry now
        </button>
      </div>
    </div>
  )
}
