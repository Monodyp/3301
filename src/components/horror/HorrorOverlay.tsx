import type { HorrorStage } from '../../types'

export function HorrorOverlay({ stage, glitchKey }: { stage: HorrorStage; glitchKey: number }) {
  return (
    <div className={`horror-overlay horror-${stage.toLowerCase()}`} key={glitchKey} aria-hidden="true">
      {(stage !== 'NORMAL') && <div className="scanlines" />}
      {stage === 'COMPROMISED' && <div className="rgb-split" />}
      {(stage === 'COMPROMISED' || stage === 'BLACKOUT') && <div className="static-overlay" />}
      {stage === 'BLACKOUT' && <><div className="blackout-flash" /><div className="antagonist-mark">3301</div></>}
    </div>
  )
}
