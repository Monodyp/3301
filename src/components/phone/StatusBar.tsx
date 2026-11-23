import { BatteryFull, Wifi, Signal } from 'lucide-react'

export function StatusBar({ simulatedTime }: { simulatedTime: string }) {
  return (
    <div className="status-bar" aria-label="Phone status">
      <span className="status-time">{simulatedTime}</span>
      <div className="status-icons">
        <Signal size={14} strokeWidth={2.2} />
        <Wifi size={15} strokeWidth={2.2} />
        <BatteryFull size={18} strokeWidth={1.8} />
      </div>
    </div>
  )
}
