import type { HorrorStage } from '../../types'

export function DeveloperPanel({ selectedStage, setStage, triggerNotification, triggerCall, triggerGlitch, reset }: {
  selectedStage: HorrorStage
  setStage: (stage: HorrorStage) => void
  triggerNotification: () => void
  triggerCall: () => void
  triggerGlitch: () => void
  reset: () => void
}) {
  const stages: HorrorStage[] = ['NORMAL', 'UNSETTLED', 'COMPROMISED', 'BLACKOUT']
  return (
    <aside className="developer-panel" aria-label="Developer testing panel">
      <strong>DEV</strong>
      <div className="dev-stage-buttons">
        {stages.map(stage => (
          <button key={stage} className={selectedStage === stage ? 'dev-stage-active' : undefined}
            aria-pressed={selectedStage === stage} onClick={() => setStage(stage)}>{stage}</button>
        ))}
      </div>
      <button onClick={triggerNotification}>Test notification</button>
      <button onClick={triggerCall}>Incoming call</button>
      <button onClick={triggerGlitch}>Glitch</button>
      <button className="dev-reset" onClick={reset}>Reset</button>
    </aside>
  )
}
