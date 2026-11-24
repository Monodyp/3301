// React hook around the engine. Screens call useGame() and read from it;
// they never keep their own copy of game progress.
//
//   const game = useGame()
//   game.state.phase            // 'INVESTIGATION', ...
//   game.encounter?.artifacts   // what can be inspected right now
//   game.actions.inspect(id)    // record evidence
//
// The run is saved after every change and restored on refresh.

import { useCallback, useEffect, useMemo, useReducer } from 'react'
import type { GameState } from './types.ts'
import {
  canDispatch,
  currentCharacter,
  currentEncounter,
  gameReducer,
  lastDecision,
  orderedChoices,
  type GameAction,
} from './engine.ts'
import { clearSave, loadGame, saveGame } from './storage.ts'
import { randomSeed } from './random.ts'
import { horrorStageFor, resultsByCategory, survivalRating } from './scoring.ts'

export function useGame() {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => loadGame())

  useEffect(() => {
    if (state.phase === 'MAIN_MENU') clearSave()
    else saveGame(state)
  }, [state])

  const send = useCallback((action: GameAction) => dispatch(action), [])

  const actions = useMemo(
    () => ({
      startRun: (options: { seed?: number; characterId?: string } = {}) =>
        send({ type: 'START_RUN', seed: options.seed ?? randomSeed(), now: Date.now(), characterId: options.characterId }),
      enterPhone: () => send({ type: 'ENTER_PHONE' }),
      triggerEncounter: () => send({ type: 'TRIGGER_ENCOUNTER' }),
      beginInvestigation: () => send({ type: 'BEGIN_INVESTIGATION', now: Date.now() }),
      inspect: (artifactId: string) => send({ type: 'INSPECT_ARTIFACT', artifactId }),
      useHint: () => send({ type: 'USE_HINT' }),
      openDecision: () => send({ type: 'OPEN_DECISION' }),
      backToInvestigation: () => send({ type: 'BACK_TO_INVESTIGATION' }),
      choose: (choiceId: string) => send({ type: 'CHOOSE', choiceId, now: Date.now() }),
      continue: () => send({ type: 'CONTINUE' }),
      nextEncounter: () => send({ type: 'NEXT_ENCOUNTER' }),
      showResults: () => send({ type: 'SHOW_RESULTS', now: Date.now() }),
      playAgain: (seed?: number) => send({ type: 'PLAY_AGAIN', seed: seed ?? randomSeed(), now: Date.now() }),
      devJumpTo: (index: number) => send({ type: 'DEV_JUMP_TO_ENCOUNTER', index }),
      devReset: () => send({ type: 'DEV_RESET' }),
    }),
    [send],
  )

  const derived = useMemo(() => deriveGameView(state), [state])

  const can = useCallback((type: GameAction['type']) => canDispatch(state, type), [state])

  return { state, actions, can, ...derived }
}

// Everything screens usually need, computed from state in one place.
export function deriveGameView(state: GameState) {
  const encounter = currentEncounter(state)
  const correctCount = state.decisionHistory.filter(d => d.correct).length
  const mistakes = state.decisionHistory.length - correctCount
  return {
    character: currentCharacter(state),
    encounter,
    choices: orderedChoices(state),
    lastDecision: lastDecision(state),
    hintsShown: encounter ? encounter.hints.slice(0, state.hintsUsed[encounter.id] ?? 0) : [],
    correctCount,
    rating: survivalRating(correctCount),
    horrorStage: horrorStageFor(state.completedEncounters.length, mistakes),
    categoryResults: resultsByCategory(state.decisionHistory),
    progress: { done: state.completedEncounters.length, total: state.encounterQueue.length },
  }
}

export type Game = ReturnType<typeof useGame>
