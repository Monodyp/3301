import type { GameState } from '../game/types.ts'
import { validateScenarioAssignment } from '../game/scenarioRegistry.ts'

export interface ParticipantRunProgress {
  [key: string]: unknown
  schemaVersion: 1
  scenarioIds: string[]
  currentScenarioId: string | null
  phase: GameState['phase']
  completedScenarioCount: number
  totalScore: number
  scenarios: Array<{
    scenarioId: string
    ordinal: number
    state: 'assigned' | 'delivered' | 'investigating' | 'resolved' | 'completed'
    resolutionCorrect: boolean | null
    evidence: string[]
    incorrectActions: string[]
    scoreImpact: number
  }>
  actions: Array<{
    scenarioId: string
    actionId: string
    actionKind: 'evidence' | 'protective_action' | 'incident_resolution'
    correct: boolean | null
  }>
}

export function participantRunProgress(state: GameState): ParticipantRunProgress {
  if (state.runMode !== 'event' || !state.eventRunId || state.encounterQueue.length !== 5) {
    throw new Error('Cannot save progress for an invalid event run.')
  }
  const assignment = validateScenarioAssignment(state.encounterQueue)
  if (!assignment.ok) throw new Error(assignment.error)
  const entries = new Map<string, (typeof assignment.entries)[number]>(
    assignment.entries.map(entry => [entry.scenarioId, entry]),
  )

  const scenarios = state.encounterQueue.map((scenarioId, index) => {
    const entry = entries.get(scenarioId)
    if (!entry) throw new Error(`Unknown assigned scenario "${scenarioId}".`)

    const decision = state.decisionHistory.find(record => record.encounterId === scenarioId)
    const interactionIds = state.performedPhoneInteractions[scenarioId] ?? []
    const incorrectActions = interactionIds.filter(interactionId =>
      entry.action.interactions.some(interaction =>
        interaction.id === interactionId && interaction.classification === 'incorrect',
      ),
    )
    const isCurrent = index === state.currentEncounterIndex
    const completed = state.completedEncounters.includes(scenarioId)
    const scenarioState: ParticipantRunProgress['scenarios'][number]['state'] = state.phase === 'RESULTS'
      ? 'completed'
      : completed
        ? 'resolved'
        : isCurrent
          ? state.phase === 'ENCOUNTER_INTRO'
            ? 'delivered'
            : state.phase === 'INVESTIGATION' || state.phase === 'DECISION'
              ? 'investigating'
              : 'assigned'
          : 'assigned'
    const evidence = entry.encounter.artifacts
      .filter(artifact => state.inspectedArtifacts.includes(artifact.id))
      .map(artifact => artifact.id)

    return {
      scenarioId,
      ordinal: index + 1,
      state: scenarioState,
      resolutionCorrect: decision?.correct ?? null,
      evidence,
      incorrectActions,
      scoreImpact: decision?.score.total ?? 0,
    }
  })

  const actions: ParticipantRunProgress['actions'] = []
  for (const scenario of scenarios) {
    const entry = entries.get(scenario.scenarioId)!
    for (const artifactId of scenario.evidence) {
      actions.push({
        scenarioId: scenario.scenarioId,
        actionId: `evidence:${artifactId}`,
        actionKind: 'evidence',
        correct: true,
      })
    }
    for (const interactionId of state.performedPhoneInteractions[scenario.scenarioId] ?? []) {
      const interaction = entry.action.interactions.find(item => item.id === interactionId)
      if (!interaction) throw new Error(`Unknown phone interaction "${interactionId}" for "${scenario.scenarioId}".`)
      actions.push({
        scenarioId: scenario.scenarioId,
        actionId: interaction.id,
        actionKind: 'protective_action',
        correct: interaction.classification === 'correct',
      })
    }
    if (scenario.resolutionCorrect !== null) {
      actions.push({
        scenarioId: scenario.scenarioId,
        actionId: `resolution:${scenario.scenarioId}`,
        actionKind: 'incident_resolution',
        correct: scenario.resolutionCorrect,
      })
    }
  }

  return {
    schemaVersion: 1,
    scenarioIds: [...state.encounterQueue],
    currentScenarioId: state.encounterQueue[state.currentEncounterIndex] ?? null,
    phase: state.phase,
    completedScenarioCount: state.completedEncounters.length,
    totalScore: state.playerScore,
    scenarios,
    actions,
  }
}

export function participantDecisionRecords(state: GameState): Array<Record<string, unknown>> {
  if (state.runMode !== 'event'
    || state.encounterQueue.length !== 5
    || state.decisionHistory.length !== 5
    || state.decisionHistory.some((record, index) => record.encounterId !== state.encounterQueue[index])) {
    throw new Error('A completed five-scenario event run is required to submit results.')
  }
  return state.decisionHistory.map(record => ({
    scenarioId: record.encounterId,
    correct: record.correct,
    secondsTaken: record.secondsTaken,
    inspectedKeyEvidence: record.inspectedKeyEvidence,
    totalKeyEvidence: record.totalKeyEvidence,
    hintsUsed: record.hintsUsed,
  }))
}

export function participantCompletionTimeMs(state: GameState): number {
  if (state.runMode !== 'event'
    || state.runStartedAt === null
    || state.runFinishedAt === null
    || state.runFinishedAt < state.runStartedAt) {
    throw new Error('The event run has no valid completion time.')
  }
  return state.runFinishedAt - state.runStartedAt
}
