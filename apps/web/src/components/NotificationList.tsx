import type { NotificationPreview } from '@ajani/contracts'
import { formatDateTime } from '../utils/previewFormatting'
import { useNotificationSession } from '../context/notificationSessionContextValue'
import { Badge } from './ui/Badge'

export function NotificationList({
  items,
  panel = false,
  recipientId,
}: {
  readonly items: readonly NotificationPreview[]
  readonly panel?: boolean
  readonly recipientId: string
}) {
  const { isNotificationRead } = useNotificationSession()

  return (
    <ol className={`notification-list${panel ? ' notification-list--panel' : ''}`}>
      {items.map((notification) => (
        <li key={notification.id}>
          <span
            aria-hidden="true"
            className={`notification-dot notification-dot--${notification.tone}`}
          />
          <div>
            <strong>{notification.title}</strong>
            <p>{notification.detail}</p>
            <time dateTime={notification.createdAt}>
              {formatDateTime(notification.createdAt)}
            </time>
          </div>
          {!isNotificationRead(recipientId, notification) && (
            <Badge tone="information">New</Badge>
          )}
        </li>
      ))}
    </ol>
  )
}
