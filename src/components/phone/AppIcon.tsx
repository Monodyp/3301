import type { LucideIcon } from 'lucide-react'

export function AppIcon({ icon: Icon, label, color, badge, onClick }: {
  icon: LucideIcon
  label: string
  color: string
  badge?: number
  onClick: () => void
}) {
  return (
    <button className="app-icon" onClick={onClick} aria-label={`Open ${label}`}>
      <span className="app-icon-tile" style={{ background: color }}>
        <Icon size={25} strokeWidth={1.8} />
        {badge ? <span className="app-badge">{badge}</span> : null}
      </span>
      <span className="app-icon-label">{label}</span>
    </button>
  )
}
