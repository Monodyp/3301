import type { Game } from '../../game/useGame'
import type { PhoneSurface } from '../../game/scenarioRegistry'

const SURFACE_NAMES: Record<PhoneSurface, string> = {
  messages: 'Messages',
  social: 'Social',
  email: 'Email',
  browser: 'Browser',
  contacts: 'Contacts',
  calls: 'Calls',
  wallet: 'Wallet',
  settings: 'Settings',
}

export function ProtectiveActionCard({ game, surface }: { game: Game; surface: PhoneSurface }) {
  const entry = game.resolutionAction
  const scenario = game.scenario
  if (
    !entry
    || !scenario
    || scenario.encounterId !== entry.scenarioId
    || scenario.decisionId === null
    || !entry.action.steps.some(step => step.surface === surface)
  ) return null

  const narrativeReady = game.state.phase === 'INVESTIGATION'
    && scenario.requiredActions.every(action => (game.state.narrative.completedActions[scenario.id] ?? []).includes(action.id))
    && scenario.narrativeContent.every(content => game.state.narrative.presentedNarrative.includes(content.id))
  if (!narrativeReady) return null

  const completed = game.state.resolutionSteps[entry.scenarioId] ?? []
  const nextStep = entry.action.steps[completed.length]
  const feedback = game.state.resolutionActionFeedback
  const showFeedback = feedback?.scenarioId === entry.scenarioId && feedback.outcome !== 'resolved'

  return (
    <section className="protective-action-card" aria-label={`${SURFACE_NAMES[surface]} protective action`}>
      <div className="protective-action-heading">
        <span>Incident response</span>
        <small>{completed.length}/{entry.action.steps.length}</small>
      </div>
      <strong>{entry.encounter.title}</strong>
      <p>{entry.action.playerDescription}</p>
      {completed.length > 0 && (
        <ul className="protective-action-completed">
          {entry.action.steps.slice(0, completed.length).map(step => (
            <li key={step.id}>{step.confirmation}</li>
          ))}
        </ul>
      )}
      {nextStep?.surface === surface ? (
        <button
          className="protective-action-step"
          disabled={!game.can('PERFORM_PROTECTIVE_ACTION')}
          onClick={() => game.actions.performProtectiveAction({
            scenarioId: entry.scenarioId,
            actionId: entry.action.id,
            stepId: nextStep.id,
            surface,
          })}
        >
          {nextStep.label}
        </button>
      ) : nextStep ? (
        <small className="protective-action-next">Continue in {SURFACE_NAMES[nextStep.surface]}.</small>
      ) : null}
      {showFeedback && <p className="protective-action-feedback" role="status">{feedback.message}</p>}
    </section>
  )
}
