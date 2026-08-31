import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  NotificationSessionContext,
  type NotificationSessionContextValue,
} from './notificationSessionContextValue'

type ReadIdsByRecipient = ReadonlyMap<string, ReadonlySet<string>>

export function NotificationSessionProvider({
  children,
}: {
  readonly children: ReactNode
}) {
  const [readIdsByRecipient, setReadIdsByRecipient] =
    useState<ReadIdsByRecipient>(() => new Map())

  const isNotificationRead = useCallback<
    NotificationSessionContextValue['isNotificationRead']
  >(
    (recipientId, notification) =>
      notification.readAt !== null ||
      (readIdsByRecipient.get(recipientId)?.has(notification.id) ?? false),
    [readIdsByRecipient],
  )

  const markNotificationsRead = useCallback<
    NotificationSessionContextValue['markNotificationsRead']
  >((recipientId, notificationIds) => {
    if (notificationIds.length === 0) return

    setReadIdsByRecipient((current) => {
      const next = new Map(current)
      const recipientReadIds = new Set(current.get(recipientId) ?? [])
      notificationIds.forEach((notificationId) => {
        recipientReadIds.add(notificationId)
      })
      next.set(recipientId, recipientReadIds)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ isNotificationRead, markNotificationsRead }),
    [isNotificationRead, markNotificationsRead],
  )

  return (
    <NotificationSessionContext.Provider value={value}>
      {children}
    </NotificationSessionContext.Provider>
  )
}
