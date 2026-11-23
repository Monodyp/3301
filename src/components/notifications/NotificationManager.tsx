import { useEffect, useState } from 'react'
import type { AppId, GameNotification } from '../../types'
import { NotificationBanner } from './NotificationBanner'

export function NotificationManager({ notification, openApp }: {
  notification: GameNotification | null
  openApp: (source: AppId) => void
}) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!notification) return
    setVisible(true)
    const timer = window.setTimeout(() => setVisible(false), 6500)
    return () => window.clearTimeout(timer)
  }, [notification])
  if (!notification || !visible) return null
  return <NotificationBanner notification={notification} onOpen={openApp} />
}
