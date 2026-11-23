import type { ReactNode } from 'react'
import type { HorrorStage } from '../../types'
import { StatusBar } from './StatusBar'
import { NavigationBar } from './NavigationBar'
import { HorrorOverlay } from '../horror/HorrorOverlay'

export function PhoneShell({ children, simulatedTime, onBack, onHome, horrorStage, glitchActive, glitchId, warningVisible, warningId, dismissWarning }: {
  children: ReactNode
  simulatedTime: string
  onBack: () => void
  onHome: () => void
  horrorStage: HorrorStage
  glitchActive: boolean
  glitchId: number
  warningVisible: boolean
  warningId: number
  dismissWarning: () => void
}) {
  return (
    <main className={`phone-shell horror-${horrorStage.toLowerCase()}${glitchActive ? ' glitch-active' : ''}`}>
      <StatusBar simulatedTime={simulatedTime} />
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
