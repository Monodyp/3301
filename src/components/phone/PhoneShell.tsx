import type { ReactNode } from 'react'
import { StatusBar } from './StatusBar'
import { NavigationBar } from './NavigationBar'

export function PhoneShell({ children, simulatedTime, onBack, onHome }: {
  children: ReactNode
  simulatedTime: string
  onBack: () => void
  onHome: () => void
}) {
  return (
    <main className="phone-shell">
      <StatusBar simulatedTime={simulatedTime} />
      <div className="phone-screen">{children}</div>
      <NavigationBar onBack={onBack} onHome={onHome} />
    </main>
  )
}
