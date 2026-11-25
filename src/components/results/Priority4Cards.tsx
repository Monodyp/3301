import type { Category } from '../../game/types'
import type { Game } from '../../game/useGame'
import { EDUCATIONAL_DEBRIEF, feedbackForDecision } from '../../game/educational'

export function FeedbackCard({ game, onContinue }: { game: Game; onContinue: () => void }) {
  const encounter = game.encounter
  const decision = game.lastDecision
  if (!encounter || !decision) return null
  const feedback = feedbackForDecision(encounter, decision)
  const isEventRun = game.state.runMode === 'event'
  return (
    <aside className="feedback-card" role="dialog" aria-label={isEventRun ? 'Protective action feedback' : 'Decision feedback'}>
      <span className={`feedback-result ${decision.correct ? 'correct' : 'incorrect'}`}>
        {isEventRun ? 'Incident secured' : feedback.result}
      </span>
      <h2>{decision.correct ? 'Secure response' : 'Risky response — here is a safer way'}</h2>
      <div className="feedback-section">
        <strong>Why this mattered</strong>
        <p>{decision.correct ? feedback.principle : feedback.selectedOutcome}</p>
      </div>
      {!decision.correct && feedback.saferChoice && (
        <div className="feedback-section safer-choice">
          <strong>Safer choice</strong>
          <p>{feedback.saferChoice}</p>
        </div>
      )}
      <div className="feedback-section">
        <strong>Security principle</strong>
        <p>{feedback.principle}</p>
      </div>
      <div className="feedback-section">
        <strong>Recommended action</strong>
        <p>{feedback.recommendedAction}</p>
      </div>
      <div className="feedback-category">{labelCategory(feedback.category)}</div>
      <button onClick={onContinue}>Continue</button>
    </aside>
  )
}

export function ResultsScreen({ game, onPlayAgain, playAgainLabel = 'Play again', eventSyncStatus, eventSyncError, onRetryEventSync }: {
  game: Game
  onPlayAgain: () => void
  playAgainLabel?: string
  eventSyncStatus?: 'idle' | 'saving' | 'saved' | 'error' | null
  eventSyncError?: string | null
  onRetryEventSync?: () => void
}) {
  const categoryResults = game.categoryResults
  return (
    <aside className="results-screen" role="dialog" aria-label="Run results">
      <div className="results-head">
        <span>Survival result</span>
        <strong>{game.rating}</strong>
      </div>
      <div className="results-stats">
        <div><strong>{game.state.playerScore}</strong><span>Total score</span></div>
        <div><strong>{game.correctCount}/{game.state.encounterQueue.length}</strong><span>Correct</span></div>
        <div><strong>{game.completionTime}</strong><span>Time</span></div>
      </div>
      {eventSyncStatus && (
        <div className={`event-result-sync event-result-sync-${eventSyncStatus}`} role={eventSyncStatus === 'error' ? 'alert' : 'status'}>
          {eventSyncStatus === 'error'
            ? <><span>{eventSyncError ?? 'Event results could not be submitted.'}</span><button type="button" onClick={onRetryEventSync}>Retry submission</button></>
            : eventSyncStatus === 'saved'
              ? 'Event results submitted.'
              : 'Submitting event results…'}
        </div>
      )}
      <div className="category-results" aria-label="Category results">
        {categoryResults.map(result => (
          <div key={result.category}>
            <span>{labelCategory(result.category)}</span>
            <strong>{result.correct}/{result.total}</strong>
          </div>
        ))}
      </div>
      <div className="education-debrief">
        <h2>Educational debrief</h2>
        {categoryResults.map(result => {
          const mapping = EDUCATIONAL_DEBRIEF[result.category]
          return (
            <section key={result.category}>
              <strong>{mapping.topic}</strong>
              <p>{mapping.lesson}</p>
              <b>Takeaway:</b> <span>{mapping.takeaway}</span>
              <small>Performance: {result.correct}/{result.total} correct in {labelCategory(result.category)}.</small>
            </section>
          )
        })}
      </div>
      <button className="results-play-again" onClick={onPlayAgain}>{playAgainLabel}</button>
    </aside>
  )
}

function labelCategory(category: Category): string {
  if (category === 'awareness') return 'Awareness'
  if (category === 'responsibility') return 'Responsibility'
  return 'Opportunity'
}
