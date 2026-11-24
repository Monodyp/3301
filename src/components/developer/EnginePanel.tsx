import { useState } from 'react'
import type { Game } from '../../game/useGame'
import { CHARACTERS } from '../../game/content/index'
import type { GameAction } from '../../game/engine'

// Dev-only panel (open the game with ?dev=1) for driving the engine without
// the real screens: start a run with a fixed seed, step through phases,
// inspect evidence, pick answers, and jump to any encounter.

const STEPS: { type: GameAction['type']; label: string }[] = [
  { type: 'ENTER_PHONE', label: 'Enter phone' },
  { type: 'TRIGGER_ENCOUNTER', label: 'Trigger' },
  { type: 'BEGIN_INVESTIGATION', label: 'Investigate' },
  { type: 'OPEN_DECISION', label: 'Decide' },
  { type: 'BACK_TO_INVESTIGATION', label: 'Back' },
  { type: 'CONTINUE', label: 'Continue' },
  { type: 'NEXT_ENCOUNTER', label: 'Next' },
  { type: 'SHOW_RESULTS', label: 'Results' },
]

export function EnginePanel({ game }: { game: Game }) {
  const { state, actions, can, character, encounter, choices, lastDecision, hintsShown } = game
  const [seedText, setSeedText] = useState('')
  const [characterId, setCharacterId] = useState('')
  const seed = seedText.trim() === '' ? undefined : Number(seedText) >>> 0

  const step = (type: GameAction['type']) => {
    switch (type) {
      case 'ENTER_PHONE': return actions.enterPhone()
      case 'TRIGGER_ENCOUNTER': return actions.triggerEncounter()
      case 'BEGIN_INVESTIGATION': return actions.beginInvestigation()
      case 'OPEN_DECISION': return actions.openDecision()
      case 'BACK_TO_INVESTIGATION': return actions.backToInvestigation()
      case 'CONTINUE': return actions.continue()
      case 'NEXT_ENCOUNTER': return actions.nextEncounter()
      case 'SHOW_RESULTS': return actions.showResults()
    }
  }

  const investigating = state.phase === 'INVESTIGATION' || state.phase === 'DECISION'

  return (
    <aside className="engine-panel" aria-label="Game engine test panel">
      <div className="engine-head">
        <strong>ENGINE</strong>
        <code>{state.phase}</code>
      </div>

      <div className="engine-row">
        <input aria-label="Seed" placeholder="seed (random)" value={seedText} onChange={e => setSeedText(e.target.value)} />
        <select aria-label="Character" value={characterId} onChange={e => setCharacterId(e.target.value)}>
          <option value="">random</option>
          {CHARACTERS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="engine-row">
        <button disabled={!can('START_RUN')} onClick={() => actions.startRun({ seed, characterId: characterId || undefined })}>Start run</button>
        <button disabled={!can('PLAY_AGAIN')} onClick={() => actions.playAgain(seed)}>Play again</button>
        <button className="engine-danger" onClick={actions.devReset}>Reset</button>
      </div>

      {character && (
        <dl className="engine-stats">
          <dt>Character</dt><dd>{character.name} ({character.archetype})</dd>
          <dt>Seed</dt><dd>{state.seed}</dd>
          <dt>Encounter</dt><dd>{state.currentEncounterIndex + 1}/{state.encounterQueue.length} {encounter ? `${encounter.archetype} ${encounter.title}` : ''}</dd>
          <dt>Score</dt><dd>{state.playerScore} ({game.correctCount} correct, {game.rating})</dd>
          <dt>Horror</dt><dd>{game.horrorStage}</dd>
          <dt>Security</dt><dd>{state.accountSecurity}/100</dd>
          <dt>Wallet</dt><dd>₱{state.walletBalance.toLocaleString()}</dd>
          <dt>BC-07 clues</dt><dd>{state.blackoutClues.length}</dd>
        </dl>
      )}

      <div className="engine-row engine-wrap">
        {STEPS.map(s => (
          <button key={s.type} disabled={!can(s.type)} onClick={() => step(s.type)}>{s.label}</button>
        ))}
      </div>

      {encounter && investigating && (
        <section>
          <h4>Evidence</h4>
          {encounter.artifacts.map(a => {
            const done = state.inspectedArtifacts.includes(a.id)
            return (
              <button key={a.id} className={done ? 'engine-done' : undefined} onClick={() => actions.inspect(a.id)} title={a.detail}>
                {done ? '✓' : '○'} {a.label} <small>[{a.app}]</small>
              </button>
            )
          })}
          <button disabled={hintsShown.length >= encounter.hints.length} onClick={actions.useHint}>
            Hint ({hintsShown.length}/{encounter.hints.length})
          </button>
          {hintsShown.map((h, i) => <p key={i} className="engine-note">💡 {h.text}</p>)}
        </section>
      )}

      {encounter && state.phase === 'DECISION' && (
        <section>
          <h4>{encounter.prompt}</h4>
          {choices.map(c => (
            <button key={c.id} onClick={() => actions.choose(c.id)}>
              {c.isCorrect ? '✔ ' : ''}{c.text}
            </button>
          ))}
        </section>
      )}

      {lastDecision && (state.phase === 'CONSEQUENCE' || state.phase === 'ENCOUNTER_COMPLETE') && (
        <section>
          <h4>{lastDecision.correct ? 'Correct' : 'Incorrect'} · +{lastDecision.score.total}</h4>
          <p className="engine-note">
            base {lastDecision.score.base} · time {lastDecision.score.timeBonus} · clues {lastDecision.score.clueBonus} · {lastDecision.secondsTaken}s
          </p>
          {encounter && <p className="engine-note">{encounter.choices.find(c => c.id === lastDecision.choiceId)?.outcome}</p>}
          {encounter && <p className="engine-note">{encounter.feedback.principle}</p>}
        </section>
      )}

      {state.phase === 'RESULTS' && (
        <section>
          <h4>{game.rating}</h4>
          {game.categoryResults.map(r => <p key={r.category} className="engine-note">{r.category}: {r.correct}/{r.total}</p>)}
        </section>
      )}

      {state.encounterQueue.length > 0 && (
        <section>
          <h4>Jump to encounter</h4>
          <div className="engine-row engine-wrap">
            {state.encounterQueue.map((id, i) => (
              <button
                key={id}
                className={state.completedEncounters.includes(id) ? 'engine-done' : undefined}
                onClick={() => actions.devJumpTo(i)}
                title={id}
              >
                {i + 1}. {id.split('-')[1]}
              </button>
            ))}
          </div>
        </section>
      )}

      <button onClick={() => console.log('3301 game state', state)}>Log state to console</button>
    </aside>
  )
}
