import { useEffect, useState } from 'react'
import { Search, ShieldAlert, X } from 'lucide-react'
import type { Game } from '../../game/useGame'
import type { AppId } from '../../types'

export function EvidenceTray({ game, openApp }: { game: Game; openApp: (app: AppId) => void }) {
  const [open, setOpen] = useState(false)
  const encounter = game.encounter
  if (!encounter) return null
  const discovered = game.character?.encounters.flatMap(item => item.artifacts).filter(artifact =>
    game.state.inspectedArtifacts.includes(artifact.id),
  ) ?? []
  const found = game.state.inspectedArtifacts.filter(id => encounter.artifacts.some(a => a.id === id)).length

  return (
    <>
      <button className="evidence-tray-toggle" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-label={`Evidence ${found} of ${encounter.artifacts.length} found`}>
        <Search size={16} />
        Evidence
        {/* Keyed by the count so the badge pulses each time a clue is found. */}
        <b key={found} className={found > 0 ? 'evidence-count-pulse' : undefined}>{found}/{encounter.artifacts.length}</b>
      </button>
      {open && (
        <aside className="evidence-tray" aria-label="Evidence tray">
          <div className="evidence-tray-head">
            <strong>{encounter.title}</strong>
            <button onClick={() => setOpen(false)} aria-label="Close evidence tray"><X size={16} /></button>
          </div>
          {encounter.artifacts.map(artifact => {
            const discovered = game.state.inspectedArtifacts.includes(artifact.id)
            return (
              <button
                key={artifact.id}
                className={`evidence-item ${discovered ? 'discovered' : ''}`}
                disabled={!discovered}
                onClick={() => discovered && openApp(artifact.app)}
              >
                <Search size={14} />
                <span>
                  <strong>{artifact.label}</strong>
                  <small>{discovered ? artifact.detail : `${encounter.id} · Undiscovered`}</small>
                </span>
              </button>
            )
          })}
          {discovered.length > 0 && (
            <div className="evidence-history">
              <strong>Previously discovered</strong>
              {discovered.filter(artifact => !encounter.artifacts.some(active => active.id === artifact.id)).map(artifact => (
                <button key={artifact.id} onClick={() => openApp(artifact.app)}>
                  <Search size={13} />
                  <span><strong>{artifact.label}</strong><small>{artifact.detail}</small></span>
                </button>
              ))}
            </div>
          )}
        </aside>
      )}
    </>
  )
}

export function InvestigationHints({ game }: { game: Game }) {
  if (!game.encounter || !['INVESTIGATION', 'DECISION'].includes(game.state.phase)) return null
  const latest = game.hintsShown[game.hintsShown.length - 1]
  if (!latest) return null
  return (
    <div className="investigation-hint" role="status">
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
  const evidence = encounter.artifacts.filter(artifact => game.state.inspectedArtifacts.includes(artifact.id))
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
      <details className="decision-evidence">
        <summary>Evidence found ({evidence.length})</summary>
        <ul>
          {evidence.map(artifact => <li key={artifact.id}><strong>{artifact.label}</strong> {artifact.detail}</li>)}
        </ul>
      </details>
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
