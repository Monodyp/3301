// Helpers that play the engine the way the phone screens do: by reporting
// phone events, never by poking state directly.

import { currentEncounter, gameReducer, type GameAction } from '../../src/game/engine.ts'
import { PHONE_TARGETS, activeScenario } from '../../src/game/narrative.ts'
import type { GameState, PhoneEvent } from '../../src/game/types.ts'

export const T0 = 1_700_000_000_000

export function run(state: GameState, ...actions: GameAction[]): GameState {
  return actions.reduce(gameReducer, state)
}

export function phoneEvent(state: GameState, event: PhoneEvent, now = T0): GameState {
  return gameReducer(state, { type: 'REPORT_PHONE_EVENT', event, now })
}

// S1: the player opens the incident (conversation, email, post or call screen).
export function openIncident(state: GameState, now = T0): GameState {
  const encounter = currentEncounter(state)!
  return phoneEvent(state, { kind: 'CONVERSATION_OPENED', app: encounter.trigger.app, target: PHONE_TARGETS.incident(encounter.id) }, now)
}

// S2: the player takes in the authored narrative (reads the thread, hears the call).
export function takeInNarrative(state: GameState, now = T0): GameState {
  let s = state
  const scenario = activeScenario(s)
  for (const action of scenario?.requiredActions ?? []) s = phoneEvent(s, action.anyOf[0], now)
  return s
}

export function findEvidence(state: GameState, now = T0, onlyKey = true): GameState {
  let s = state
  for (const artifact of currentEncounter(s)!.artifacts.filter(a => !onlyKey || a.isKeyEvidence)) {
    s = gameReducer(s, { type: 'INSPECT_ARTIFACT', artifactId: artifact.id, now })
  }
  return s
}

// From PHONE_IDLE to a pending (not yet open) decision.
export function investigateFully(state: GameState, now = T0): GameState {
  return findEvidence(takeInNarrative(openIncident(gameReducer(state, { type: 'TRIGGER_ENCOUNTER' }), now), now), now)
}

export function openPending(state: GameState): GameState {
  return gameReducer(state, { type: 'OPEN_DECISION', decisionId: state.narrative.pendingDecisionId ?? 'none' })
}

export function decisionIdFor(encounterId: string): string {
  return `${encounterId}-D1`
}

export function memoryStorage() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }
}
