import { BatteryFull, Wifi, Signal } from 'lucide-react'

export function StatusBar({ simulatedTime, playerName }: { simulatedTime: string; playerName?: string }) {
  return (
    <div className="status-bar" aria-label="Phone status">
      <span className="status-time">{simulatedTime}</span>
      {playerName && <span className="phone-player-identity" aria-label={`Player ${playerName}`}>PLAYER · {playerName}</span>}
      <div className="status-icons">
        <Signal size={14} strokeWidth={2.2} />
        <Wifi size={15} strokeWidth={2.2} />
        <BatteryFull size={18} strokeWidth={1.8} />
      </div>
    </div>
  )
}
