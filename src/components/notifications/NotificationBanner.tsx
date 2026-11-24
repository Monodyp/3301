import { MessageCircle, Users, Mail, Globe2, Phone, Radio, ShoppingBag, Wifi, BriefcaseBusiness, Terminal, ShieldAlert, X } from 'lucide-react'
import type { GameNotification } from '../../types'

const icons = { messages: MessageCircle, social: Users, email: Mail, browser: Globe2, calls: Phone, contacts: Users, wallet: Mail, settings: MessageCircle, livestream: Radio, marketplace: ShoppingBag, wifi: Wifi, jobs: BriefcaseBusiness, ctf: Terminal }

export function NotificationBanner({ notification, onOpen, onDismiss }: {
  notification: GameNotification
  onOpen: (notification: GameNotification) => void
  onDismiss?: (id: string) => void
}) {
  const attack = notification.variant === 'attack'
  const Icon = attack ? ShieldAlert : icons[notification.source]
  return (
    <div
      className={`notification-banner${attack ? ` notification-attack attack-tier-${notification.tier ?? 1}` : ''}`}
      role={attack ? 'alert' : 'status'}
    >
      <button className="notification-open" onClick={() => onOpen(notification)}>
        <span className="notification-app"><Icon size={17} /></span>
        <span className="notification-copy">
          {attack && notification.tierLabel && <em className="notification-tier">{notification.tierLabel}</em>}
          <strong>{notification.title}</strong>
          <span>{notification.message}</span>
          {notification.detail && <small>{notification.detail}</small>}
        </span>
        <time>{notification.timestamp}</time>
      </button>
      {onDismiss && (
        <button className="notification-dismiss" aria-label="Dismiss notification" onClick={() => onDismiss(notification.id)}><X size={14} /></button>
      )}
    </div>
  )
}
