// Connects the engine to the phone's horror effects and timers.
// Call it once, next to useGame(), where the horror controls are available.
//
// What it does while a run is active:
// - Horror stage follows progress (game.horrorStage), not a fixed timer.
// - A wrong answer whose consequence is a glitch, an antagonist message or an
//   account compromise triggers a screen glitch.
// - Entering the final reveal triggers the "system interruption" glitch.
// - Hints appear on their own when the player stalls (see nextHintDueAt).
// - With autoPace on, encounters arrive by themselves: the first one after
//   a short look around the phone, the rest shortly after each one ends.
//
// Restoring a saved run after a refresh does not replay old glitches.

import { useEffect, useRef } from 'react'
import type { ConsequenceKind, HorrorStage } from './types.ts'
import type { Game } from './useGame.ts'

export const PACING = {
  // GDD 8.2: 0:00–0:15 profile, 0:15–0:30 normal phone, first incident at about 0:30.
  // The profile card waits for the player, so this counts from entering the phone.
  firstEncounterAfterMs: 15_000,
  // Short breather between incidents so a run fits in about 7 minutes.
  betweenEncountersMs: 5_000,
} as const

const GLITCH_ON: readonly ConsequenceKind[] = ['glitch', 'antagonist', 'account_compromise']

export interface HorrorControls {
  setStage: (stage: HorrorStage) => void
  triggerGlitch: () => void
}

export function useGameEffects(game: Game, horror: HorrorControls, options: { autoPace?: boolean } = {}) {
  const { state, actions, horrorStage, nextHintAt } = game
  const { setStage, triggerGlitch } = horror
  const autoPace = options.autoPace ?? true
  const runActive = state.phase !== 'MAIN_MENU'

  // Horror stage follows progress while a run is active.
  useEffect(() => {
    setStage(runActive ? horrorStage : 'NORMAL')
  }, [runActive, horrorStage, setStage])

  // Glitch on new consequences only, never on the ones restored from a save.
  const seenConsequences = useRef(state.consequences.length)
  useEffect(() => {
    const count = state.consequences.length
    if (count > seenConsequences.current) {
      const latest = state.consequences[count - 1]
      if (GLITCH_ON.includes(latest.kind)) triggerGlitch()
    }
    seenConsequences.current = count
  }, [state.consequences, triggerGlitch])

  // The final reveal opens with a system interruption.
  const previousPhase = useRef(state.phase)
  useEffect(() => {
    if (state.phase === 'FINAL_REVEAL' && previousPhase.current !== 'FINAL_REVEAL') triggerGlitch()
    previousPhase.current = state.phase
  }, [state.phase, triggerGlitch])

  // Hint timer.
  useEffect(() => {
    if (nextHintAt === null) return
    const timer = window.setTimeout(actions.useHint, Math.max(0, nextHintAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [nextHintAt, actions])

  // Encounter pacing.
  const isFirst = state.completedEncounters.length === 0
  useEffect(() => {
    if (!autoPace || state.phase !== 'PHONE_IDLE') return
    const delay = isFirst ? PACING.firstEncounterAfterMs : PACING.betweenEncountersMs
    const timer = window.setTimeout(actions.triggerEncounter, delay)
    return () => window.clearTimeout(timer)
  }, [autoPace, state.phase, state.currentEncounterIndex, isFirst, actions])
}
