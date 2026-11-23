import { MessageCircle, Users, Mail, Globe2, Phone } from 'lucide-react'
import type { AppId, GameNotification } from '../../types'

const icons = { messages: MessageCircle, social: Users, email: Mail, browser: Globe2, calls: Phone, contacts: Users, wallet: Mail, settings: MessageCircle }

export function NotificationBanner({ notification, onOpen }: { notification: GameNotification; onOpen: (source: AppId) => void }) {
  const Icon = icons[notification.source]
  return (
    <button className="notification-banner" onClick={() => onOpen(notification.source)}>
      <span className="notification-app"><Icon size={17} /></span>
      <span className="notification-copy">
        <strong>{notification.title}</strong>
        <span>{notification.message}</span>
      </span>
      <time>{notification.timestamp}</time>
    </button>
  )
}
