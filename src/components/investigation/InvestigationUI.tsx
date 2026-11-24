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

  return (
    <>
      <button className="evidence-tray-toggle" onClick={() => setOpen(value => !value)} aria-expanded={open}>
        <Search size={16} />
        Evidence
        <b>{game.state.inspectedArtifacts.filter(id => encounter.artifacts.some(a => a.id === id)).length}/{encounter.artifacts.length}</b>
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
                onClick={() => {
                  if (discovered) openApp(artifact.app)
                  else game.actions.inspect(artifact.id)
                }}
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
          {game.state.blackoutClues.length > 0 && (
            <div className="bc07-fragments">
              <strong>BC-07 fragments</strong>
              {game.character?.encounters.filter(item => game.state.blackoutClues.includes(item.clue.id)).map(item => (
                <p key={item.clue.id}><b>{item.clue.id}</b> — {item.clue.fragment}</p>
              ))}
            </div>
          )}
        </aside>
      )}
    </>
  )
}

export function ArtifactLayer({ game, app }: { game: Game; app: AppId | null }) {
  const encounter = game.encounter
  if (!encounter || !['INVESTIGATION', 'DECISION'].includes(game.state.phase)) return null
  const openedArtifacts = encounter.artifacts.filter(artifact => artifact.app === app)
  return (
    <div className="artifact-layer" aria-label="Inspectable encounter evidence">
      {openedArtifacts.map(artifact => {
        const discovered = game.state.inspectedArtifacts.includes(artifact.id)
        return (
          <button
            key={artifact.id}
            className={`artifact-cue ${discovered ? 'inspected' : ''}`}
            onClick={() => game.actions.inspect(artifact.id)}
            title={discovered ? artifact.detail : 'Inspect evidence'}
          >
            <Search size={12} />
            <span>{discovered ? 'Inspected' : 'Inspect'}</span>
          </button>
        )
      })}
    </div>
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

export function DecisionSheet({ game }: { game: Game }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  useEffect(() => {
    setSelected(null)
    setSubmitted(false)
  }, [game.encounter?.id])

  if (!game.encounter || game.state.phase !== 'DECISION') return null
  const submit = () => {
    if (!selected || submitted) return
    setSubmitted(true)
    game.actions.choose(selected)
  }
  return (
    <aside className="decision-sheet" aria-label="Decision sheet">
      <strong>{game.encounter.prompt}</strong>
      <p>{game.encounter.lesson}</p>
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
