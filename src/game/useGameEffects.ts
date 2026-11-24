// Engine-driven effects that App.tsx doesn't already handle.
// Call it once, next to useGame(), where the horror controls are available.
//
// - Clues on screen are discovered once they have been viewed for
//   CLUE_DWELL_MS without a break: this timer fires CLUE_TICK at that moment.
//   The engine re-checks the timing, so a late or early tick is harmless.
// - Hints appear on their own when the player stalls: 10 s after the last
//   new evidence or hint, and never once all key evidence is found
//   (see nextHintDueAt in engine.ts).
// - A wrong answer whose consequence is a glitch, an antagonist message or an
//   account compromise glitches the screen. Restoring a saved run after a
//   refresh does not replay old glitches.
//
// Horror stage and encounter pacing are handled in App.tsx.

import { useEffect, useRef } from 'react'
import type { ConsequenceKind } from './types.ts'
import type { Game } from './useGame.ts'

const GLITCH_ON: readonly ConsequenceKind[] = ['glitch', 'antagonist', 'account_compromise']

export function useGameEffects(game: Game, horror: { triggerGlitch: () => void }) {
  const { state, actions, nextHintAt, nextClueAt } = game
  const { triggerGlitch } = horror

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

  // Clue dwell timer.
  useEffect(() => {
    if (nextClueAt === null) return
    const timer = window.setTimeout(actions.clueTick, Math.max(0, nextClueAt - Date.now()) + 20)
    return () => window.clearTimeout(timer)
  }, [nextClueAt, actions])

  // Hint timer.
  useEffect(() => {
    if (nextHintAt === null) return
    const timer = window.setTimeout(actions.useHint, Math.max(0, nextHintAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [nextHintAt, actions])
}
