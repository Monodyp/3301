import { useEffect, useState } from 'react'
import { ShieldAlert, X } from 'lucide-react'
import type { Game } from '../../game/useGame'

export function InvestigationHints({ game }: { game: Game }) {
  const latest = game.hintsShown[game.hintsShown.length - 1]
  const active = ['INVESTIGATION', 'DECISION'].includes(game.state.phase)
  const key = game.encounter && latest
    ? `${game.encounter.id}:${game.hintsShown.length}`
    : null
  const [initialKey] = useState(key)
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)

  useEffect(() => {
    if (key === null || key === initialKey) return
    const timer = window.setTimeout(() => setDismissedKey(key), 5000)
    return () => window.clearTimeout(timer)
  }, [initialKey, key])

  if (!active || !latest || key === initialKey || key === dismissedKey) return null
  return (
    <div className="investigation-hint transient-context" role="status">
      <ShieldAlert size={15} />
      <span>{latest.text}</span>
    </div>
  )
}

// Shown only while the engine has a validated pending decision, so the player
// can reopen a decision sheet they closed. There is no general "decide" button.
export function PendingDecisionChip({ game }: { game: Game }) {
  const decision = game.pendingDecision
  const encounter = game.encounter
  if (!decision || !encounter || game.state.phase !== 'INVESTIGATION') return null
  return (
    <button className="pending-decision-chip" onClick={() => game.actions.openDecision(decision.id)}>
      <ShieldAlert size={15} />
      <span><small>Decision pending</small><strong>Respond to {encounter.trigger.sender}</strong></span>
    </button>
  )
}

// The pending decision, with the context it belongs to. Closing it keeps the
// decision pending and all evidence; nothing is submitted until Confirm.
// Render it with key={decision id} so a new decision starts unselected.
export function DecisionSheet({ game }: { game: Game }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const { closeDecision } = game.actions
  const open = game.state.phase === 'DECISION'

  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDecision()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [closeDecision, open])

  const encounter = game.encounter
  const decision = game.pendingDecision
  if (!encounter || !decision || !open) return null
  const submit = () => {
    if (!selected || submitted) return
    setSubmitted(true)
    game.actions.choose(selected, decision.id)
  }
  return (
    <aside className="decision-sheet" role="dialog" aria-modal="true" aria-labelledby="decision-prompt">
      <button className="decision-close" aria-label="Close decision" onClick={closeDecision}><X size={18} /></button>
      <span className="decision-context-label">{encounter.title} · {encounter.trigger.sender}</span>
      <blockquote className="decision-context">{encounter.trigger.message}</blockquote>
      <strong id="decision-prompt">{decision.prompt}</strong>
      <p>{encounter.lesson}</p>
      <div className="decision-options">
        {game.choices.map(option => (
          <button
            key={option.id}
            className={selected === option.id ? 'selected' : ''}
            disabled={submitted}
            onClick={() => setSelected(option.id)}
          >
            {option.text}
          </button>
        ))}
      </div>
      <button className="decision-submit" disabled={!selected || submitted} onClick={submit}>
        Confirm action
      </button>
    </aside>
  )
}
