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
        <div className="compromise-warning" role="alertdialog" aria-modal="true" aria-labelledby="integrity-title" key={warningId}>
          <div className="warning-content">
            <span className="warning-mark" aria-hidden="true">!</span>
            <p className="warning-kicker">3301 DEVICE SECURITY</p>
            <h2 id="integrity-title">SYSTEM INTEGRITY FAILURE</h2>
            <p>UNAUTHORIZED ACTIVITY DETECTED</p>
            <p>DEVICE STATUS: COMPROMISED</p>
            <p>UNKNOWN PROCESS DETECTED</p>
            <button onClick={onDismissWarning}>DISMISS WARNING</button>
          </div>
        </div>
      )}
    </div>
  )
}
