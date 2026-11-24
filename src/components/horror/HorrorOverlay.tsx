import type { HorrorStage } from '../../types'

export function HorrorOverlay({ stage, glitchActive, glitchId, warningVisible, warningId, onDismissWarning }: {
  stage: HorrorStage
  glitchActive: boolean
  glitchId: number
  warningVisible: boolean
  warningId: number
  onDismissWarning: () => void
}) {
  return (
    <div className="horror-effects" aria-hidden={!warningVisible}>
      {stage !== 'NORMAL' && <div className="stage-interference" aria-hidden="true" />}
      {stage === 'BLACKOUT' && <div className="antagonist-mark" aria-hidden="true">3301</div>}
      {glitchActive && (
        <div className="glitch-event" key={glitchId} aria-hidden="true">
          <span className="glitch-band glitch-band-one" />
          <span className="glitch-band glitch-band-two" />
          <span className="glitch-static" />
        </div>
      )}
      {warningVisible && (
        <div className="compromise-warning" role="status" aria-live="polite" aria-labelledby="integrity-title" key={warningId}>
          <div className="warning-content">
            <span className="warning-mark" aria-hidden="true">!</span>
            <div className="warning-message">
              <h2 id="integrity-title">DEVICE COMPROMISED</h2>
              <p>Unauthorized activity detected.</p>
            </div>
            <button aria-label="Dismiss security warning" onClick={onDismissWarning}>×</button>
          </div>
        </div>
      )}
    </div>
  )
}
