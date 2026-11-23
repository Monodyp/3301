import { ChevronLeft, Circle } from 'lucide-react'

export function NavigationBar({ onBack, onHome }: { onBack: () => void; onHome: () => void }) {
  return (
    <div className="nav-bar" aria-label="Phone navigation">
      <button onClick={onBack} aria-label="Back"><ChevronLeft size={19} /></button>
      <button onClick={onHome} aria-label="Home"><Circle size={16} /></button>
    </div>
  )
}
