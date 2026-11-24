import { useEffect, useRef } from 'react'
import { CheckCircle2, Search } from 'lucide-react'
import type { Game, ClueView } from '../../game/useGame'
import type { AppId } from '../../types'
import { CLUE_DWELL_MS } from '../../game/narrative'

// The active encounter's clues that live in this app and this view. Each card
// tells the engine when its content is actually on screen; the engine
// discovers the clue after CLUE_DWELL_MS of uninterrupted viewing. Nothing has
// to be pressed. Tapping a card is an optional shortcut.
export function ClueCards({ game, app, surface }: { game: Game; app: AppId; surface: 'incident' | 'app' }) {
  const clues = game.clues.filter(clue => clue.source.app === app && clue.source.surface === surface)
  if (clues.length === 0) return null
  const highlighted = game.hintsShown[game.hintsShown.length - 1]?.highlightArtifactId
  return (
    <section className="clue-cards" aria-label="Evidence in this app">
      {clues.map(clue => (
        <ClueCard key={clue.artifact.id} clue={clue} highlighted={highlighted === clue.artifact.id} actions={game.actions} />
      ))}
    </section>
  )
}

function ClueCard({ clue, highlighted, actions }: { clue: ClueView; highlighted: boolean; actions: Game['actions'] }) {
  const ref = useRef<HTMLElement>(null)
  const id = clue.artifact.id
  const { clueVisible, clueHidden, inspect } = actions

  // On screen = at least 60% of the card in view, in a visible browser tab.
  useEffect(() => {
    const node = ref.current
    if (!node) return
    let inView = typeof IntersectionObserver === 'undefined'
    const update = () => {
      if (inView && document.visibilityState === 'visible') clueVisible(id)
      else clueHidden(id)
    }
    const observer = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(entries => {
        inView = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.6)
        update()
      }, { threshold: [0, 0.6, 1] })
    observer?.observe(node)
    if (!observer) update()
    document.addEventListener('visibilitychange', update)
    return () => {
      observer?.disconnect()
      document.removeEventListener('visibilitychange', update)
      clueHidden(id) // leaving the app or view cancels an unfinished timer
    }
  }, [id, clueVisible, clueHidden])

  const status = clue.discovered ? 'Clue found' : clue.viewingSince !== null ? 'Examining…' : 'Evidence'
  return (
    <article
      ref={ref}
      className={`clue-card ${clue.discovered ? 'discovered' : clue.viewingSince !== null ? 'examining' : ''} ${highlighted && !clue.discovered ? 'highlighted' : ''}`}
      onClick={() => !clue.discovered && inspect(id)}
    >
      <header>
        {clue.discovered ? <CheckCircle2 size={14} /> : <Search size={14} />}
        <strong>{clue.artifact.label}</strong>
        <span role="status">{status}</span>
      </header>
      <p>{clue.artifact.detail}</p>
      {!clue.discovered && clue.viewingSince !== null && (
        <i className="clue-progress" key={clue.viewingSince} style={{ animationDuration: `${CLUE_DWELL_MS}ms` }} aria-hidden="true" />
      )}
    </article>
  )
}
