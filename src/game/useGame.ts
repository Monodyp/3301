// React hook around the engine. Screens call useGame() and read from it;
// they never keep their own copy of game progress.
//
//   const game = useGame()
//   game.state.phase                 // 'INVESTIGATION', ...
//   game.encounter?.artifacts        // what can be inspected right now
//   game.actions.reportPhoneEvent(e) // tell the engine what the player did
//   game.pendingDecision             // set only while a decision is valid
//
// The run is saved after every change and restored on refresh.

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { GameState, PhoneEvent } from './types.ts'
import {
  canDispatch,
  currentNpc,
  currentEncounter,
  gameReducer,
  lastDecision,
  nextHintDueAt,
  orderedChoices,
  type GameAction,
} from './engine.ts'
import { activeScenario, incidentDue, isDiscoverable, nextClueDueAt, pendingDecision } from './narrative.ts'
import { clueSource, type ClueSource } from './content/scenarios.ts'
import { attackEvents, attackNotificationDue } from './attacks.ts'
import type { Artifact } from './types.ts'
import { clearSave, loadGame, saveGame } from './storage.ts'
import type { RunStorageMode } from './storage.ts'
import {
  getScenarioDefinition,
  isScenarioId,
  type PhoneSurface,
  type ResolutionActionId,
  type ScenarioId,
} from './scenarioRegistry.ts'
import { randomSeed } from './random.ts'
import { horrorStageFor, resultsByCategory, survivalRating } from './scoring.ts'
import { formatCompletionTime } from './educational.ts'

export function useGame(storageMode: RunStorageMode = 'practice') {
  const [state, dispatch] = useReducer(gameReducer, storageMode, mode => loadGame(undefined, mode))
  const previousStorageMode = useRef(storageMode)

  useEffect(() => {
    if (state.phase === 'MAIN_MENU') return
    saveGame(state)
  }, [state])

  useEffect(() => {
    if (previousStorageMode.current === storageMode) return
    previousStorageMode.current = storageMode
    dispatch({ type: 'RESTORE_SAVED_RUN', state: loadGame(undefined, storageMode) })
  }, [storageMode])

  const send = useCallback((action: GameAction) => dispatch(action), [])

  const actions = useMemo(
    () => ({
      startRun: (options: { seed?: number; characterId?: string } = {}) =>
        send({ type: 'START_RUN', seed: options.seed ?? randomSeed(), now: Date.now(), characterId: options.characterId }),
      startAssignedRun: (options: { runId: string; scenarioIds: readonly ScenarioId[]; seed?: number }) =>
        send({
          type: 'START_ASSIGNED_RUN',
          runId: options.runId,
          scenarioIds: options.scenarioIds,
          seed: options.seed ?? randomSeed(),
          now: Date.now(),
        }),
      performProtectiveAction: (options: {
        scenarioId: ScenarioId
        actionId: ResolutionActionId
        stepId: string
        surface: PhoneSurface
      }) => send({ type: 'PERFORM_PROTECTIVE_ACTION', ...options, now: Date.now() }),
      enterPhone: () => send({ type: 'ENTER_PHONE' }),
      // Delivers the active encounter's incident. The engine ignores it unless one is due.
      triggerEncounter: () => send({ type: 'TRIGGER_ENCOUNTER' }),
      reportPhoneEvent: (event: PhoneEvent) => send({ type: 'REPORT_PHONE_EVENT', event, now: Date.now() }),
      inspect: (artifactId: string) => send({ type: 'INSPECT_ARTIFACT', artifactId, now: Date.now() }),
      clueVisible: (artifactId: string) => send({ type: 'CLUE_VISIBLE', artifactId, now: Date.now() }),
      clueHidden: (artifactId: string) => send({ type: 'CLUE_HIDDEN', artifactId, now: Date.now() }),
      cluesHidden: () => send({ type: 'CLUES_HIDDEN', now: Date.now() }),
      clueTick: () => send({ type: 'CLUE_TICK', now: Date.now() }),
      attackNotified: (attackId: string) => send({ type: 'ATTACK_NOTIFIED', attackId }),
      useHint: () => send({ type: 'USE_HINT', now: Date.now() }),
      openDecision: (decisionId: string) => send({ type: 'OPEN_DECISION', decisionId }),
      closeDecision: () => send({ type: 'BACK_TO_INVESTIGATION' }),
      choose: (choiceId: string, decisionId?: string) => send({ type: 'CHOOSE', choiceId, decisionId, now: Date.now() }),
      continue: () => send({ type: 'CONTINUE' }),
      nextEncounter: () => send({ type: 'NEXT_ENCOUNTER', now: Date.now() }),
      playAgain: (seed?: number) => send({ type: 'PLAY_AGAIN', seed: seed ?? randomSeed(), now: Date.now() }),
      devJumpTo: (index: number) => send({ type: 'DEV_JUMP_TO_ENCOUNTER', index }),
      devReset: () => {
        clearSave(undefined, state.runMode ?? storageMode)
        send({ type: 'DEV_RESET' })
      },
      completeSecurityTask: (taskId: string) => send({ type: 'COMPLETE_SECURITY_TASK', taskId }),
    }),
    [send, state.runMode, storageMode],
  )

  const derived = useMemo(() => deriveGameView(state), [state])

  const can = useCallback((type: GameAction['type']) => canDispatch(state, type), [state])

  return { state, actions, can, ...derived }
}

// Everything screens usually need, computed from state in one place.
export function deriveGameView(state: GameState) {
  const encounter = currentEncounter(state)
  const activeEncounterId = state.narrative.activeEncounterId
  const resolutionAction = state.runMode === 'event' && activeEncounterId && isScenarioId(activeEncounterId)
    ? getScenarioDefinition(activeEncounterId)
    : undefined
  const correctCount = state.decisionHistory.filter(d => d.correct).length
  const mistakes = state.decisionHistory.length - correctCount
  const decision = pendingDecision(state)
  const investigating = state.phase === 'INVESTIGATION' || state.phase === 'DECISION'
  const clues: ClueView[] = encounter && investigating
    ? encounter.artifacts
      .filter(artifact => state.inspectedArtifacts.includes(artifact.id) || isDiscoverable(state, artifact.id))
      .map(artifact => ({
        artifact,
        source: clueSource(encounter, artifact),
        discovered: state.inspectedArtifacts.includes(artifact.id),
        viewingSince: state.clueViewing[artifact.id] ?? null,
      }))
    : []
  return {
    storyCharacter: currentNpc(state),
    encounter,
    // Only the pending decision's choices, in this player's shuffled order.
    choices: decision ? orderedChoices(state).filter(choice => decision.choiceIds.includes(choice.id)) : [],
    scenario: activeScenario(state),
    resolutionAction: resolutionAction ?? null,
    pendingDecision: decision,
    incidentDue: incidentDue(state),
    lastDecision: lastDecision(state),
    hintsShown: encounter ? encounter.hints.slice(0, state.hintsUsed[encounter.id] ?? 0) : [],
    correctCount,
    rating: survivalRating(correctCount),
    horrorStage: horrorStageFor(state.completedEncounters.length, mistakes),
    categoryResults: resultsByCategory(state.decisionHistory),
    progress: { done: state.completedEncounters.length, total: state.encounterQueue.length },
    completionTime: formatCompletionTime(state.runStartedAt, state.runFinishedAt),
    nextHintAt: nextHintDueAt(state),
    // The active encounter's clues that can be (or have been) discovered, with where each is shown.
    clues,
    nextClueAt: nextClueDueAt(state),
    attackDue: attackNotificationDue(state),
    securityAlerts: attackEvents(state),
  }
}

export interface ClueView {
  artifact: Artifact
  source: ClueSource
  discovered: boolean
  viewingSince: number | null
}

export type Game = ReturnType<typeof useGame>
