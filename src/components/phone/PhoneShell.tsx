import type { ReactNode } from 'react'
import type { HorrorStage } from '../../types'
import { StatusBar } from './StatusBar'
import { NavigationBar } from './NavigationBar'
import { HorrorOverlay } from '../horror/HorrorOverlay'
import { playAppTouch } from '../../game/audio'

export function PhoneShell({ children, simulatedTime, playerName, evidenceProgress, onBack, onHome, horrorStage, glitchActive, glitchId, corruptionLevel, warningVisible, warningId, dismissWarning }: {
  children: ReactNode
  simulatedTime: string
  playerName?: string
  evidenceProgress?: { discovered: number; total: number }
  onBack: () => void
  onHome: () => void
  horrorStage: HorrorStage
  glitchActive: boolean
  glitchId: number
  corruptionLevel: number
  warningVisible: boolean
  warningId: number
  dismissWarning: () => void
}) {
  return (
    <main
      className={`phone-shell horror-${horrorStage.toLowerCase()}${glitchActive ? ' glitch-active' : ''}${corruptionLevel > 0 ? ` corruption-level-${corruptionLevel}` : ''}`}
      onClickCapture={event => {
        const target = event.target
        if (target instanceof Element && target.closest('button, a, input, select, textarea, [role="button"]')) {
          playAppTouch()
        }
      }}
    >
      <StatusBar simulatedTime={simulatedTime} playerName={playerName} evidenceProgress={evidenceProgress} />
      <div className="phone-screen">{children}</div>
      <HorrorOverlay
        stage={horrorStage}
        glitchActive={glitchActive}
        glitchId={glitchId}
        warningVisible={warningVisible}
        warningId={warningId}
        onDismissWarning={dismissWarning}
      />
      <NavigationBar onBack={onBack} onHome={onHome} />
    </main>
  )
}
