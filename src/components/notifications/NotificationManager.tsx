import { useEffect } from 'react'
import type { GameNotification } from '../../types'
import { NotificationBanner } from './NotificationBanner'

const SHOW_MS = 6500
const ATTACK_SHOW_MS = 9000

// Shows the current notifications stacked at the top of the phone. Each one
// hides itself after a while or when dismissed; an ordinary notification and
// a cyberattack notification can be on screen together without replacing
// each other.
export function NotificationManager({ notifications, onOpen, onDismiss }: {
  notifications: readonly GameNotification[]
  onOpen: (notification: GameNotification) => void
  onDismiss: (id: string) => void
}) {
  if (notifications.length === 0) return null
  return (
    <div className="notification-stack">
      {notifications.map(notification => (
        <TimedBanner key={notification.id} notification={notification} onOpen={onOpen} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function TimedBanner({ notification, onOpen, onDismiss }: {
  notification: GameNotification
  onOpen: (notification: GameNotification) => void
  onDismiss: (id: string) => void
}) {
  const { id, variant } = notification
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(id), variant === 'attack' ? ATTACK_SHOW_MS : SHOW_MS)
    return () => window.clearTimeout(timer)
  }, [id, variant, onDismiss])
  return <NotificationBanner notification={notification} onOpen={onOpen} onDismiss={onDismiss} />
}
