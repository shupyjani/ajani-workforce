import type { NotificationPreview } from '@ajani/contracts'
import { createContext, useContext } from 'react'

export interface NotificationSessionContextValue {
  readonly isNotificationRead: (
    recipientId: string,
    notification: Pick<NotificationPreview, 'id' | 'readAt'>,
  ) => boolean
  readonly markNotificationsRead: (
    recipientId: string,
    notificationIds: readonly string[],
  ) => void
}

export const NotificationSessionContext =
  createContext<NotificationSessionContextValue | null>(null)

export function useNotificationSession(): NotificationSessionContextValue {
  const context = useContext(NotificationSessionContext)

  if (context === null) {
    throw new Error('Notification session context is unavailable')
  }

  return context
}
