import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'information'

export function Badge({
  children,
  tone = 'neutral',
}: {
  readonly children: ReactNode
  readonly tone?: BadgeTone
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}
