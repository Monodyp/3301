import { BatteryFull, Wifi, Signal } from 'lucide-react'

export function StatusBar({ simulatedTime, playerName, evidenceProgress }: {
  simulatedTime: string
  playerName?: string
  evidenceProgress?: { discovered: number; total: number }
}) {
  return (
    <div className="status-bar" aria-label="Phone status">
      <span className="status-time">{simulatedTime}</span>
      {playerName && <span className="phone-player-identity" aria-label={`Player ${playerName}`}>PLAYER · {playerName}</span>}
      <div className="status-icons">
        {evidenceProgress && evidenceProgress.total > 0 && (
          <span
            className="status-evidence-count"
            aria-label={`${evidenceProgress.discovered} of ${evidenceProgress.total} evidence discovered`}
            aria-live="polite"
          >
            {evidenceProgress.discovered}/{evidenceProgress.total}
          </span>
        )}
        <Signal size={14} strokeWidth={2.2} />
        <Wifi size={15} strokeWidth={2.2} />
        <BatteryFull size={18} strokeWidth={1.8} />
      </div>
    </div>
  )
}
