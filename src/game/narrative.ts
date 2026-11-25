// Narrative controller: pure functions the reducer uses to move encounters and
// scenarios forward. Nothing here touches React or storage.
//
// The rules:
// - One encounter is active at a time: the one at currentEncounterIndex in the
//   run's (shuffled) queue. It unlocks only when every earlier encounter in the
//   queue, and every encounter it declares in requiresEncounters, is resolved.
// - Within the encounter, one scenario is active at a time. Phone events count
//   only if they match a required action of the active scenario; everything
//   else is ignored, so unrelated browsing never moves the story.
// - A decision is available only when checkDecision() says so. The reducer
//   asks it before opening the decision sheet and again before accepting a
//   choice, so hiding a button is never the only safeguard.

import type {
  DecisionDefinition,
  EncounterLifecycle,
  GameState,
  NarrativeState,
  PhoneEvent,
  ScenarioAction,
  ScenarioDefinition,
} from './types.ts'
import { getCharacter } from './content/index.ts'
import { getScenarioDefinition, isScenarioId } from './scenarioRegistry.ts'
import { ENCOUNTER_NARRATIVES, NARRATIVE_CONTENT, PHONE_TARGETS, getDecision, getEncounterNarrative, getScenario } from './content/scenarios.ts'

export { NARRATIVE_CONTENT, PHONE_TARGETS }

export function initialNarrativeState(): NarrativeState {
  return {
    activeEncounterId: null,
    activeScenarioId: null,
    encounterLifecycle: {},
    scenarioLifecycle: {},
    completedActions: {},
    presentedNarrative: [],
    pendingDecisionId: null,
    submittedDecisionIds: [],
    encounterResolution: {},
  }
}

// A new run: every encounter and scenario starts locked.
export function lockedNarrative(encounterIds: readonly string[]): NarrativeState {
  const encounterLifecycle: NarrativeState['encounterLifecycle'] = {}
  const scenarioLifecycle: NarrativeState['scenarioLifecycle'] = {}
  for (const id of encounterIds) {
    encounterLifecycle[id] = 'LOCKED'
    for (const scenario of getEncounterNarrative(id)?.scenarios ?? []) scenarioLifecycle[scenario.id] = 'LOCKED'
  }
  return { ...initialNarrativeState(), encounterLifecycle, scenarioLifecycle }
}

// Puts encounters after the ones they require, otherwise keeping the shuffled
// order. The shuffle is only an ordering preference; authored dependencies win.
export function orderByDependencies(queue: readonly string[], requires: (id: string) => readonly string[]): string[] {
  const inQueue = new Set(queue)
  const placed: string[] = []
  const placedSet = new Set<string>()
  const remaining = [...queue]
  while (remaining.length > 0) {
    const index = remaining.findIndex(id => requires(id).every(r => placedSet.has(r) || !inQueue.has(r)))
    // A cycle cannot be ordered; validateNarrative() reports it. Keep going in shuffled order.
    const [next] = remaining.splice(index === -1 ? 0 : index, 1)
    placed.push(next)
    placedSet.add(next)
  }
  return placed
}

export function requiredEncounters(encounterId: string): readonly string[] {
  return ENCOUNTER_NARRATIVES.get(encounterId)?.requiresEncounters ?? []
}

// ---------------------------------------------------------------- selectors

function queuedEncounterId(state: GameState): string | null {
  return state.encounterQueue[state.currentEncounterIndex] ?? null
}

export function activeScenario(state: GameState): ScenarioDefinition | undefined {
  const scenario = getScenario(state.narrative.activeScenarioId)
  if (!scenario || scenario.encounterId !== state.narrative.activeEncounterId) return undefined
  if (state.narrative.scenarioLifecycle[scenario.id] !== 'ACTIVE') return undefined
  return scenario
}

export function prerequisitesMet(state: GameState, encounterId: string): boolean {
  const index = state.encounterQueue.indexOf(encounterId)
  if (index < 0) return false
  const resolved = (id: string) => state.narrative.encounterLifecycle[id] === 'RESOLVED'
  return state.encounterQueue.slice(0, index).every(resolved) && requiredEncounters(encounterId).every(resolved)
}

// The active encounter is unlocked and its incident has not arrived yet.
export function incidentDue(state: GameState): boolean {
  const id = state.narrative.activeEncounterId
  return state.phase === 'PHONE_IDLE' && id !== null && id === queuedEncounterId(state) && state.narrative.encounterLifecycle[id] === 'AVAILABLE'
}

export function hasPresented(state: GameState, contentId: string): boolean {
  return state.narrative.presentedNarrative.includes(contentId)
}

export interface ScenarioProgress {
  actionsComplete: boolean
  narrativePresented: boolean
  evidenceFound: boolean
}

export function scenarioProgress(state: GameState, scenario: ScenarioDefinition): ScenarioProgress {
  const done = state.narrative.completedActions[scenario.id] ?? []
  const presented = new Set(state.narrative.presentedNarrative)
  return {
    actionsComplete: scenario.requiredActions.every(action => done.includes(action.id)),
    narrativePresented: scenario.narrativeContent.every(content => presented.has(content.id)),
    evidenceFound: scenario.requiredEvidence.every(id => state.inspectedArtifacts.includes(id)),
  }
}

function requirementsMet(state: GameState, scenario: ScenarioDefinition): boolean {
  const progress = scenarioProgress(state, scenario)
  return progress.actionsComplete && progress.narrativePresented
}

// ---------------------------------------------------------------- clues

// A clue is recorded only after the player has spent more than three uninterrupted seconds on it.
export const CLUE_DWELL_MS = 3000

// Whether a clue can be discovered right now: it belongs to the active
// encounter, the active scenario is the one that asks for evidence, and the
// player is investigating. Clues of other encounters or scenarios never are.
export function isDiscoverable(state: GameState, artifactId: string): boolean {
  if (state.phase !== 'INVESTIGATION' && state.phase !== 'DECISION') return false
  const encounterId = state.narrative.activeEncounterId
  if (!encounterId || encounterId !== queuedEncounterId(state)) return false
  const scenario = activeScenario(state)
  if (!scenario || scenario.requiredEvidence.length === 0) return false
  const encounter = isScenarioId(encounterId) ? getScenarioDefinition(encounterId)?.encounter : undefined
  return encounter?.artifacts.some(a => a.id === artifactId) ?? false
}

// When the next clue on screen finishes its dwell time, or null.
export function nextClueDueAt(state: GameState): number | null {
  const starts = Object.values(state.clueViewing)
  return starts.length === 0 ? null : Math.min(...starts) + CLUE_DWELL_MS + 1
}

// ---------------------------------------------------------------- decisions

export type DecisionRejection =
  | 'unknown-decision'
  | 'wrong-character'
  | 'already-submitted'
  | 'inactive-encounter'
  | 'inactive-scenario'
  | 'not-investigating'
  | 'actions-incomplete'
  | 'narrative-not-presented'
  | 'event-run-actions-required'

export type DecisionCheck = { ok: true; decision: DecisionDefinition } | { ok: false; reason: DecisionRejection }

// The single rule for whether a decision may be shown or answered.
export function checkDecision(state: GameState, decisionId: string | null): DecisionCheck {
  if (state.runMode === 'event') return { ok: false, reason: 'event-run-actions-required' }
  const decision = getDecision(decisionId)
  if (!decision) return { ok: false, reason: 'unknown-decision' }
  const authoredEncounter = isScenarioId(decision.encounterId)
    ? getScenarioDefinition(decision.encounterId)?.encounter
    : undefined
  if (!authoredEncounter || decision.characterId !== authoredEncounter.characterId) {
    return { ok: false, reason: 'wrong-character' }
  }
  if (
    decision.characterId !== state.characterId || !getCharacter(state.characterId)
  ) {
    return { ok: false, reason: 'wrong-character' }
  }
  if (state.narrative.submittedDecisionIds.includes(decision.id)) return { ok: false, reason: 'already-submitted' }
  if (decision.encounterId !== state.narrative.activeEncounterId || decision.encounterId !== queuedEncounterId(state)) {
    return { ok: false, reason: 'inactive-encounter' }
  }
  const scenario = activeScenario(state)
  if (!scenario || scenario.id !== decision.scenarioId || scenario.decisionId !== decision.id) return { ok: false, reason: 'inactive-scenario' }
  if (state.phase !== 'INVESTIGATION' && state.phase !== 'DECISION') return { ok: false, reason: 'not-investigating' }
  const progress = scenarioProgress(state, scenario)
  if (!progress.actionsComplete) return { ok: false, reason: 'actions-incomplete' }
  if (!progress.narrativePresented) return { ok: false, reason: 'narrative-not-presented' }
  return { ok: true, decision }
}

// The pending decision, only while it is still valid.
export function pendingDecision(state: GameState): DecisionDefinition | undefined {
  const check = checkDecision(state, state.narrative.pendingDecisionId)
  return check.ok ? check.decision : undefined
}

// ---------------------------------------------------------------- transitions

function withNarrative(state: GameState, changes: Partial<NarrativeState>): GameState {
  return { ...state, narrative: { ...state.narrative, ...changes } }
}

function setLifecycle(state: GameState, encounterId: string, lifecycle: EncounterLifecycle): GameState {
  if (state.narrative.encounterLifecycle[encounterId] === lifecycle) return state
  return withNarrative(state, { encounterLifecycle: { ...state.narrative.encounterLifecycle, [encounterId]: lifecycle } })
}

// Makes the queued encounter the active one if its prerequisites are met.
export function unlockQueuedEncounter(state: GameState): GameState {
  const id = queuedEncounterId(state)
  if (!id || !prerequisitesMet(state, id)) return withNarrative(state, { activeEncounterId: null, activeScenarioId: null, pendingDecisionId: null })
  const next = withNarrative(state, { activeEncounterId: id, activeScenarioId: null, pendingDecisionId: null })
  return next.narrative.encounterLifecycle[id] === 'LOCKED' ? setLifecycle(next, id, 'AVAILABLE') : next
}

// The trigger notification arrives and the first scenario starts.
export function deliverIncident(state: GameState): GameState {
  if (!incidentDue(state)) return state
  const narrative = getEncounterNarrative(state.narrative.activeEncounterId)
  const first = narrative?.scenarios.find(s => s.startsWhen.kind === 'incident-delivered')
  if (!narrative || !first) return state
  const next = withNarrative(state, {
    activeScenarioId: first.id,
    scenarioLifecycle: { ...state.narrative.scenarioLifecycle, [first.id]: 'ACTIVE' },
  })
  return setLifecycle(next, narrative.encounterId, 'DELIVERED')
}

function eventMatches(expected: PhoneEvent, actual: PhoneEvent): boolean {
  return expected.kind === actual.kind && expected.app === actual.app && expected.target === actual.target
}

function matchAction(scenario: ScenarioDefinition, done: readonly string[], event: PhoneEvent): ScenarioAction | undefined {
  return scenario.requiredActions.find(action => !done.includes(action.id) && action.anyOf.some(expected => eventMatches(expected, event)))
}

// Records a phone event against the active scenario. Returns the same state
// object when the event is not one of its required actions.
export function recordPhoneEvent(state: GameState, event: PhoneEvent): GameState {
  const scenario = activeScenario(state)
  if (!scenario) return state
  const done = state.narrative.completedActions[scenario.id] ?? []
  const action = matchAction(scenario, done, event)
  if (!action) return state
  const presented = [...state.narrative.presentedNarrative]
  for (const id of action.presents) if (!presented.includes(id)) presented.push(id)
  return withNarrative(state, {
    completedActions: { ...state.narrative.completedActions, [scenario.id]: [...done, action.id] },
    presentedNarrative: presented,
  })
}

// Completes the active scenario when all its requirements are met and it does
// not wait for a decision, then starts the next one. Returns the scenarios that
// completed so the reducer can change phase.
export function advanceScenarios(state: GameState): { state: GameState; completed: ScenarioDefinition[] } {
  let next = state
  const completed: ScenarioDefinition[] = []
  for (let scenario = activeScenario(next); scenario; scenario = activeScenario(next)) {
    if (scenario.completesWhen !== 'actions-complete' || !requirementsMet(next, scenario)) break
    completed.push(scenario)
    const lifecycle = { ...next.narrative.scenarioLifecycle, [scenario.id]: 'COMPLETE' as const }
    if (scenario.next.kind === 'scenario') {
      lifecycle[scenario.next.scenarioId] = 'ACTIVE'
      next = withNarrative(next, { scenarioLifecycle: lifecycle, activeScenarioId: scenario.next.scenarioId })
    } else {
      next = withNarrative(next, { scenarioLifecycle: lifecycle, activeScenarioId: null })
    }
  }
  return { state: next, completed }
}

// Sets or clears the pending decision from the active scenario's state.
export function refreshPendingDecision(state: GameState): GameState {
  const encounterId = state.narrative.activeEncounterId
  const scenario = activeScenario(state)
  const decisionId = scenario?.decisionId ?? null
  const available = decisionId !== null && checkDecision(state, decisionId).ok
  let next = state.narrative.pendingDecisionId === (available ? decisionId : null)
    ? state
    : withNarrative(state, { pendingDecisionId: available ? decisionId : null })
  if (encounterId && scenario) {
    const current = next.narrative.encounterLifecycle[encounterId]
    if (available) next = setLifecycle(next, encounterId, 'DECISION_PENDING')
    else if (current === 'DECISION_PENDING' || (current === 'DELIVERED' && scenario.startsWhen.kind !== 'incident-delivered')) {
      next = setLifecycle(next, encounterId, 'INVESTIGATING')
    }
  }
  return next
}

// Marks the decision submitted and its scenario complete.
export function submitDecision(state: GameState, decision: DecisionDefinition, choiceId: string, correct: boolean): GameState {
  const next = withNarrative(state, {
    pendingDecisionId: null,
    submittedDecisionIds: [...state.narrative.submittedDecisionIds, decision.id],
    scenarioLifecycle: { ...state.narrative.scenarioLifecycle, [decision.scenarioId]: 'COMPLETE' },
    activeScenarioId: null,
    encounterResolution: { ...state.narrative.encounterResolution, [decision.encounterId]: { decisionId: decision.id, choiceId, correct } },
  })
  return setLifecycle(next, decision.encounterId, 'FEEDBACK')
}

export function resolveEncounter(state: GameState): GameState {
  const id = state.narrative.activeEncounterId
  if (!id || state.narrative.encounterLifecycle[id] !== 'FEEDBACK') return state
  return setLifecycle(state, id, 'RESOLVED')
}

// Re-checks a restored save. A decision that is no longer valid (an edited
// save, or content that changed) is closed and cleared instead of shown.
export function reconcileNarrative(state: GameState): GameState {
  let next = state
  const submitted = [...new Set(state.narrative.submittedDecisionIds)]
  if (submitted.length !== state.narrative.submittedDecisionIds.length) next = withNarrative(next, { submittedDecisionIds: submitted })
  if (next.narrative.pendingDecisionId && !checkDecision(next, next.narrative.pendingDecisionId).ok) {
    next = withNarrative(next, { pendingDecisionId: null })
  }
  if (next.phase === 'DECISION' && !pendingDecision(next)) next = { ...next, phase: 'INVESTIGATION' }
  if (next.phase === 'INVESTIGATION' || next.phase === 'DECISION') next = refreshPendingDecision(next)
  return next
}
