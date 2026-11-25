// The game engine: one reducer that owns all run state.
//
// Every change goes through gameReducer(state, action). Actions that are not
// allowed in the current phase are ignored (the same state object comes back),
// so a double tap or a stale button can never skip ahead, complete an encounter
// twice, or finish the run early. Use canDispatch() to grey out buttons.
//
// The reducer is also the only authority for narrative progression (see
// narrative.ts): screens report phone events, and the reducer decides whether
// that completes a scenario. Practice runs use validated decisions; event runs
// use registry-defined protective-action steps.
//
// The reducer is pure: time comes in on the action (`now`, in ms) and
// randomness comes from the run's seed. That makes every run replayable.

import type {
  AppliedConsequence,
  Character,
  DecisionRecord,
  Encounter,
  GamePhase,
  GameState,
  PhoneEvent,
} from './types.ts'
import { CHARACTERS, getCharacter } from './content/index.ts'
import { getEncounterNarrative } from './content/scenarios.ts'
import {
  getScenarioDefinition,
  isScenarioId,
  validateScenarioAssignment,
  type PhoneSurface,
  type ResolutionActionId,
  type ScenarioId,
} from './scenarioRegistry.ts'
import { createRng, pick, shuffle } from './random.ts'
import { scoreDecision } from './scoring.ts'
import { advanceAttacks, initialAttackProgress, markAttackNotified } from './attacks.ts'
import {
  CLUE_DWELL_MS,
  PHONE_TARGETS,
  activeScenario,
  advanceScenarios,
  checkDecision,
  deliverIncident,
  initialNarrativeState,
  isDiscoverable,
  lockedNarrative,
  orderByDependencies,
  recordPhoneEvent,
  refreshPendingDecision,
  requiredEncounters,
  resolveEncounter,
  submitDecision,
  unlockQueuedEncounter,
} from './narrative.ts'

export const SAVE_VERSION = 6
export const ENCOUNTERS_PER_RUN = 8
export const EVENT_SCENARIOS_PER_RUN = 5

export type GameAction =
  | { type: 'START_RUN'; seed: number; now: number; characterId?: string }
  | { type: 'START_ASSIGNED_RUN'; runId: string; scenarioIds: readonly string[]; seed: number; now: number }
  | { type: 'RESTORE_SAVED_RUN'; state: GameState }
  | { type: 'ENTER_PHONE' }
  | { type: 'TRIGGER_ENCOUNTER' } // deliver the active encounter's incident, if it is due
  | { type: 'REPORT_PHONE_EVENT'; event: PhoneEvent; now: number }
  | {
    type: 'PERFORM_PHONE_INTERACTION'
    scenarioId: ScenarioId
    interactionId: string
    surface: PhoneSurface
    parameters?: Readonly<Record<string, string>>
    now: number
  }
  | { type: 'PERFORM_PROTECTIVE_ACTION'; scenarioId: ScenarioId; actionId: ResolutionActionId; stepId: string; surface: PhoneSurface; now: number }
  | { type: 'INSPECT_ARTIFACT'; artifactId: string; now: number } // optional shortcut: discover at once
  // Automatic discovery: a clue's content came on screen / left it. After
  // CLUE_DWELL_MS of continuous viewing, CLUE_TICK (or leaving) discovers it.
  | { type: 'CLUE_VISIBLE'; artifactId: string; now: number }
  | { type: 'CLUE_HIDDEN'; artifactId: string; now: number }
  | { type: 'CLUES_HIDDEN'; now: number } // the page went to the background
  | { type: 'CLUE_TICK'; now: number }
  | { type: 'ATTACK_NOTIFIED'; attackId: string } // the attack's notification has been shown
  | { type: 'USE_HINT'; now: number }
  | { type: 'OPEN_DECISION'; decisionId: string }
  | { type: 'BACK_TO_INVESTIGATION' } // close the decision sheet; the decision stays pending
  | { type: 'CHOOSE'; choiceId: string; now: number; decisionId?: string }
  | { type: 'CONTINUE' } // CONSEQUENCE -> ENCOUNTER_COMPLETE
  | { type: 'NEXT_ENCOUNTER'; now: number } // ENCOUNTER_COMPLETE -> PHONE_IDLE or RESULTS
  | { type: 'PLAY_AGAIN'; seed: number; now: number }
  | { type: 'COMPLETE_SECURITY_TASK'; taskId: string }
  // Dev-panel only:
  | { type: 'DEV_JUMP_TO_ENCOUNTER'; index: number }
  | { type: 'DEV_RESET' }

// Which actions each phase accepts. Anything else is ignored.
const CLUE_ACTIONS = ['CLUE_VISIBLE', 'CLUE_HIDDEN', 'CLUES_HIDDEN', 'CLUE_TICK'] as const

const ALLOWED: Record<GamePhase, readonly GameAction['type'][]> = {
  MAIN_MENU: ['START_RUN'],
  CHARACTER_ASSIGNMENT: ['ENTER_PHONE', 'COMPLETE_SECURITY_TASK', 'ATTACK_NOTIFIED'],
  PHONE_IDLE: ['TRIGGER_ENCOUNTER', 'COMPLETE_SECURITY_TASK', 'ATTACK_NOTIFIED'],
  ENCOUNTER_INTRO: ['REPORT_PHONE_EVENT', 'COMPLETE_SECURITY_TASK', 'ATTACK_NOTIFIED'],
  INVESTIGATION: ['REPORT_PHONE_EVENT', 'PERFORM_PHONE_INTERACTION', 'PERFORM_PROTECTIVE_ACTION', 'INSPECT_ARTIFACT', ...CLUE_ACTIONS, 'USE_HINT', 'OPEN_DECISION', 'COMPLETE_SECURITY_TASK', 'ATTACK_NOTIFIED'],
  DECISION: ['REPORT_PHONE_EVENT', 'INSPECT_ARTIFACT', ...CLUE_ACTIONS, 'USE_HINT', 'BACK_TO_INVESTIGATION', 'CHOOSE', 'COMPLETE_SECURITY_TASK', 'ATTACK_NOTIFIED'],
  CONSEQUENCE: ['CONTINUE', 'COMPLETE_SECURITY_TASK', 'ATTACK_NOTIFIED'],
  ENCOUNTER_COMPLETE: ['NEXT_ENCOUNTER', 'COMPLETE_SECURITY_TASK', 'ATTACK_NOTIFIED'],
  RESULTS: ['PLAY_AGAIN', 'ATTACK_NOTIFIED'],
}

const DEV_ACTIONS: readonly GameAction['type'][] = ['DEV_JUMP_TO_ENCOUNTER', 'DEV_RESET']

export function initialGameState(): GameState {
  return {
    saveVersion: SAVE_VERSION,
    phase: 'MAIN_MENU',
    runMode: null,
    eventRunId: null,
    sessionId: null,
    seed: null,
    characterId: null,
    previousCharacterId: null,
    encounterQueue: [],
    choiceOrder: {},
    currentEncounterIndex: 0,
    completedEncounters: [],
    inspectedArtifacts: [],
    hintsUsed: {},
    decisionHistory: [],
    consequences: [],
    playerScore: 0,
    walletBalance: 0,
    accountSecurity: 100,
    runStartedAt: null,
    encounterStartedAt: null,
    lastProgressAt: null,
    runFinishedAt: null,
    completedSecurityTasks: [],
    narrative: initialNarrativeState(),
    resolutionSteps: {},
    performedPhoneInteractions: {},
    corruptionByScenario: {},
    resolutionActionFeedback: null,
    clueViewing: {},
    attacks: initialAttackProgress(),
  }
}

export function canDispatch(state: GameState, type: GameAction['type']): boolean {
  return type === 'START_ASSIGNED_RUN'
    || type === 'RESTORE_SAVED_RUN'
    || DEV_ACTIONS.includes(type)
    || ALLOWED[state.phase].includes(type)
}

// ---------------------------------------------------------------- selectors

export function currentNpc(state: GameState): Character | undefined {
  const encounter = currentEncounter(state)
  if (state.runMode === 'event') {
    return encounter ? getCharacter(encounter.characterId) : undefined
  }
  return CHARACTERS.find(c => c.id === state.characterId)
}

export function currentEncounter(state: GameState): Encounter | undefined {
  const id = state.encounterQueue[state.currentEncounterIndex]
  if (!id || !isScenarioId(id)) return undefined
  return getScenarioDefinition(id)?.encounter
}

// The current encounter's choices in this player's shuffled order.
export function orderedChoices(state: GameState): Encounter['choices'] {
  const encounter = currentEncounter(state)
  if (!encounter) return []
  const order = state.choiceOrder[encounter.id]
  if (!order) return encounter.choices
  return order
    .map(id => encounter.choices.find(c => c.id === id))
    .filter((c): c is Encounter['choices'][number] => c !== undefined)
}

export function lastDecision(state: GameState): DecisionRecord | undefined {
  return state.decisionHistory[state.decisionHistory.length - 1]
}

// When the next hint should appear, as a timestamp in ms, or null if none is due.
// Hints are for players who are stuck: the clock restarts whenever they find
// new evidence or get a hint, and hints stop once all key evidence is found.
// The gap before hint N is its afterSeconds minus the previous hint's
// (10 s, 20 s, 30 s in the content means one hint per 10 s of being stuck).
export function nextHintDueAt(state: GameState): number | null {
  if (state.phase !== 'INVESTIGATION' && state.phase !== 'DECISION') return null
  const encounter = currentEncounter(state)
  if (!encounter) return null
  const used = state.hintsUsed[encounter.id] ?? 0
  const next = encounter.hints[used]
  if (!next) return null
  const keyEvidence = encounter.artifacts.filter(a => a.isKeyEvidence)
  if (keyEvidence.every(a => state.inspectedArtifacts.includes(a.id))) return null
  const since = state.lastProgressAt ?? state.encounterStartedAt
  if (since === null) return null
  const previousAfter = used > 0 ? encounter.hints[used - 1].afterSeconds : 0
  const gapSeconds = Math.max(1, next.afterSeconds - previousAfter)
  return since + gapSeconds * 1000
}

// ---------------------------------------------------------------- run setup

function newRun(seed: number, now: number, previousCharacterId: string | null, forcedCharacterId?: string): GameState | null {
  const rng = createRng(seed)

  // Prefer a different character from last run when more than one exists.
  let pool: readonly Character[] = CHARACTERS
  if (forcedCharacterId) {
    pool = CHARACTERS.filter(c => c.id === forcedCharacterId)
  } else if (previousCharacterId && CHARACTERS.length > 1) {
    pool = CHARACTERS.filter(c => c.id !== previousCharacterId)
  }
  if (pool.length === 0) return null
  const character = pick(pool, rng)

  // The shuffle only orders encounters that do not depend on each other.
  const encounterQueue = orderByDependencies(shuffle(character.encounters.map(e => e.id), rng), requiredEncounters)
  const choiceOrder: Record<string, string[]> = {}
  const choiceRng = createRng((seed ^ 0x9e3779b9) >>> 0)
  for (const e of character.encounters) {
    choiceOrder[e.id] = shuffle(e.choices.map(c => c.id), choiceRng)
  }

  return {
    ...initialGameState(),
    phase: 'CHARACTER_ASSIGNMENT',
    runMode: 'practice',
    eventRunId: null,
    sessionId: `run-${seed.toString(36)}-${now.toString(36)}`,
    seed,
    characterId: character.id,
    previousCharacterId,
    encounterQueue,
    choiceOrder,
    walletBalance: character.startingBalance,
    runStartedAt: now,
    narrative: lockedNarrative(encounterQueue),
  }
}

function newAssignedRun(
  runId: string,
  scenarioIds: readonly string[],
  seed: number,
  now: number,
): GameState | null {
  if (!runId.trim()) return null
  const assignment = validateScenarioAssignment(scenarioIds)
  if (!assignment.ok) return null

  const choiceOrder: Record<string, string[]> = {}
  const choiceRng = createRng((seed ^ 0x9e3779b9) >>> 0)
  for (const entry of assignment.entries) {
    choiceOrder[entry.scenarioId] = shuffle(entry.encounter.choices.map(choice => choice.id), choiceRng)
  }

  const firstNpc = getCharacter(assignment.entries[0].npcIdentity)
  return {
    ...initialGameState(),
    phase: 'CHARACTER_ASSIGNMENT',
    runMode: 'event',
    eventRunId: runId,
    sessionId: `event-${runId}`,
    seed,
    characterId: null,
    previousCharacterId: null,
    encounterQueue: assignment.scenarioIds,
    choiceOrder,
    walletBalance: firstNpc?.startingBalance ?? 0,
    runStartedAt: now,
    narrative: lockedNarrative(assignment.scenarioIds),
  }
}

// ---------------------------------------------------------------- reducer

export function gameReducer(state: GameState, action: GameAction): GameState {
  const next = reduce(state, action)
  // Cyberattacks follow the narrative: an incident arriving triggers its attack,
  // its decision being submitted resolves it. Never the decision's result.
  return next === state ? state : advanceAttacks(next)
}

function reduce(state: GameState, action: GameAction): GameState {
  if (action.type === 'RESTORE_SAVED_RUN') return action.state
  if (action.type === 'START_ASSIGNED_RUN') {
    if (
      state.runMode === 'event'
      && state.eventRunId === action.runId
      && state.encounterQueue.length === action.scenarioIds.length
      && state.encounterQueue.every((id, index) => id === action.scenarioIds[index])
    ) {
      return state
    }
    return newAssignedRun(action.runId, action.scenarioIds, action.seed, action.now) ?? state
  }
  if (!canDispatch(state, action.type)) return state

  switch (action.type) {
    case 'START_RUN':
      return newRun(action.seed, action.now, state.previousCharacterId, action.characterId) ?? state

    case 'PLAY_AGAIN':
      if (state.runMode === 'event') return state
      return newRun(action.seed, action.now, state.characterId) ?? state

    case 'ENTER_PHONE':
      return unlockQueuedEncounter({ ...state, phase: 'PHONE_IDLE' })

    case 'TRIGGER_ENCOUNTER': {
      const next = deliverIncident(state)
      return next === state ? state : { ...next, phase: 'ENCOUNTER_INTRO' }
    }

    case 'REPORT_PHONE_EVENT': {
      if (action.event.kind === 'ARTIFACT_VIEWED') {
        const prefix = PHONE_TARGETS.artifact('')
        return action.event.target.startsWith(prefix) ? inspectArtifact(state, action.event.target.slice(prefix.length), action.now) : state
      }
      const recorded = recordPhoneEvent(state, action.event)
      if (recorded === state) return state
      return progress(recorded, action.now)
    }

    case 'PERFORM_PROTECTIVE_ACTION':
      return performProtectiveAction(state, action)

    case 'PERFORM_PHONE_INTERACTION':
      return performPhoneInteraction(state, action)

    case 'INSPECT_ARTIFACT':
      return inspectArtifact(state, action.artifactId, action.now)

    case 'CLUE_VISIBLE': {
      const { artifactId, now } = action
      if (state.inspectedArtifacts.includes(artifactId)) return state // already found: no second wait
      if (artifactId in state.clueViewing || !isDiscoverable(state, artifactId)) return state
      return { ...state, clueViewing: { ...state.clueViewing, [artifactId]: now } }
    }

    case 'CLUE_HIDDEN': {
      if (!(action.artifactId in state.clueViewing)) return state
      const settled = settleClues(state, action.now)
      if (!(action.artifactId in settled.clueViewing)) return settled
      return { ...settled, clueViewing: without(settled.clueViewing, action.artifactId) }
    }

    case 'CLUES_HIDDEN': {
      if (Object.keys(state.clueViewing).length === 0) return state
      return { ...settleClues(state, action.now), clueViewing: {} }
    }

    case 'CLUE_TICK':
      return settleClues(state, action.now)

    case 'ATTACK_NOTIFIED':
      return markAttackNotified(state, action.attackId)

    case 'USE_HINT': {
      const encounter = currentEncounter(state)
      if (!encounter) return state
      const used = state.hintsUsed[encounter.id] ?? 0
      if (used >= encounter.hints.length) return state
      return { ...state, hintsUsed: { ...state.hintsUsed, [encounter.id]: used + 1 }, lastProgressAt: action.now }
    }

    case 'OPEN_DECISION': {
      if (state.narrative.pendingDecisionId !== action.decisionId) return state
      if (!checkDecision(state, action.decisionId).ok) return state
      return { ...state, phase: 'DECISION' }
    }

    case 'BACK_TO_INVESTIGATION':
      return { ...state, phase: 'INVESTIGATION' }

    case 'CHOOSE':
      return choose(state, action.choiceId, action.now, action.decisionId ?? state.narrative.pendingDecisionId)

    case 'CONTINUE':
      return resolveEncounter({ ...state, phase: 'ENCOUNTER_COMPLETE' })

    case 'NEXT_ENCOUNTER': {
      const nextIndex = state.currentEncounterIndex + 1
      const idle = {
        ...state,
        encounterStartedAt: null,
        lastProgressAt: null,
        clueViewing: {},
        resolutionActionFeedback: null,
      }
      if (state.completedEncounters.length >= ENCOUNTERS_PER_RUN || nextIndex >= state.encounterQueue.length) {
        return {
          ...idle,
          phase: 'RESULTS',
          runFinishedAt: action.now,
          narrative: { ...state.narrative, activeEncounterId: null, activeScenarioId: null, pendingDecisionId: null },
        }
      }
      return unlockQueuedEncounter({ ...idle, phase: 'PHONE_IDLE', currentEncounterIndex: nextIndex })
    }

    case 'DEV_JUMP_TO_ENCOUNTER': {
      // Developer shortcut: makes the chosen encounter active and available,
      // skipping its prerequisites. Its scenarios and decision still have to
      // be played normally.
      if (!state.characterId) return state
      if (action.index < 0 || action.index >= state.encounterQueue.length) return state
      const id = state.encounterQueue[action.index]
      const reset = lockedNarrative([id])
      const clearedActions = { ...state.narrative.completedActions }
      for (const scenarioId of Object.keys(reset.scenarioLifecycle)) delete clearedActions[scenarioId]
      return {
        ...state,
        phase: 'PHONE_IDLE',
        currentEncounterIndex: action.index,
        encounterStartedAt: null,
        lastProgressAt: null,
        narrative: {
          ...state.narrative,
          activeEncounterId: id,
          activeScenarioId: null,
          pendingDecisionId: null,
          encounterLifecycle: { ...state.narrative.encounterLifecycle, [id]: 'AVAILABLE' },
          scenarioLifecycle: { ...state.narrative.scenarioLifecycle, ...reset.scenarioLifecycle },
          completedActions: clearedActions,
        },
      }
    }

    case 'DEV_RESET':
      return initialGameState()

    case 'COMPLETE_SECURITY_TASK':
      if (state.completedSecurityTasks.includes(action.taskId)) return state
      return { ...state, completedSecurityTasks: [...state.completedSecurityTasks, action.taskId] }
  }
}

// After a recorded phone event or new evidence: complete finished scenarios,
// move from the incident into the investigation, and refresh the pending decision.
function progress(state: GameState, now: number): GameState {
  const { state: advanced, completed } = advanceScenarios(state)
  let next = advanced
  if (next.phase === 'ENCOUNTER_INTRO' && completed.some(s => s.startsWhen.kind === 'incident-delivered')) {
    next = { ...next, phase: 'INVESTIGATION', encounterStartedAt: now, lastProgressAt: now }
  }
  return refreshPendingDecision(next)
}

function inspectArtifact(state: GameState, artifactId: string, now: number): GameState {
  if (state.inspectedArtifacts.includes(artifactId)) return state
  if (!isDiscoverable(state, artifactId)) return state
  const clueViewing = without(state.clueViewing, artifactId)
  return progress({ ...state, inspectedArtifacts: [...state.inspectedArtifacts, artifactId], lastProgressAt: now, clueViewing }, now)
}

function without(record: Record<string, number>, key: string): Record<string, number> {
  const copy = { ...record }
  delete copy[key]
  return copy
}

// Discovers every clue that has been on screen for CLUE_DWELL_MS without a
// break, and drops timers for clues that can no longer be discovered.
function settleClues(state: GameState, now: number): GameState {
  let next = state
  for (const [artifactId, since] of Object.entries(state.clueViewing)) {
    if (!isDiscoverable(next, artifactId)) {
      next = { ...next, clueViewing: without(next.clueViewing, artifactId) }
    } else if (now - since > CLUE_DWELL_MS) {
      next = inspectArtifact(next, artifactId, now)
    }
  }
  return next
}

function performPhoneInteraction(
  state: GameState,
  action: Extract<GameAction, { type: 'PERFORM_PHONE_INTERACTION' }>,
): GameState {
  if (state.runMode !== 'event' || state.phase !== 'INVESTIGATION') return state
  const active = activeScenario(state)
  const entry = getScenarioDefinition(action.scenarioId)
  const interaction = entry?.action.interactions.find(item => item.id === action.interactionId && item.surface === action.surface)
  if (
    !active
    || active.encounterId !== action.scenarioId
    || active.decisionId === null
    || state.completedEncounters.includes(action.scenarioId)
    || !entry
    || !interaction
  ) return state

  if (
    (interaction.expectedQuery
      && !action.parameters?.query?.toLowerCase().includes(interaction.expectedQuery.toLowerCase()))
    || (interaction.expectedContact && action.parameters?.contactName !== interaction.expectedContact)
  ) return state

  const completedInteractions = state.performedPhoneInteractions[action.scenarioId] ?? []
  if (completedInteractions.includes(interaction.id)) return state

  if (interaction.classification === 'correct') {
    const completedSteps = state.resolutionSteps[action.scenarioId] ?? []
    const nextStep = entry.action.steps[completedSteps.length]
    if (!nextStep || interaction.stepId !== nextStep.id) return state
    const progressed = performProtectiveAction(state, {
      type: 'PERFORM_PROTECTIVE_ACTION',
      scenarioId: action.scenarioId,
      actionId: entry.action.id,
      stepId: nextStep.id,
      surface: interaction.surface,
      now: action.now,
    })
    if (progressed === state) return state

    const currentCorruption = state.corruptionByScenario[action.scenarioId] ?? 0
    const corruptionLevel = interaction.stabilizes ? Math.max(0, currentCorruption - 1) : currentCorruption
    return {
      ...progressed,
      performedPhoneInteractions: {
        ...progressed.performedPhoneInteractions,
        [action.scenarioId]: [...completedInteractions, interaction.id],
      },
      corruptionByScenario: {
        ...progressed.corruptionByScenario,
        [action.scenarioId]: corruptionLevel,
      },
      resolutionActionFeedback: progressed.resolutionActionFeedback
        ? { ...progressed.resolutionActionFeedback, corruptionLevel }
        : null,
    }
  }

  if (!interaction.wrongChoiceId || !interaction.severity) return state
  const wrongChoice = entry.encounter.choices.find(choice => choice.id === interaction.wrongChoiceId)
  if (!wrongChoice || wrongChoice.isCorrect) return state

  const currentCorruption = state.corruptionByScenario[action.scenarioId] ?? 0
  const corruptionLevel = Math.min(4, currentCorruption + interaction.severity)
  const consequence = wrongChoice.consequence
  const expectedStep = entry.action.steps[(state.resolutionSteps[action.scenarioId] ?? []).length]
    ?? entry.action.steps[0]!
  const nextConsequences: AppliedConsequence[] = [
    ...state.consequences,
    {
      encounterId: action.scenarioId,
      kind: consequence.kind,
      amount: consequence.amount,
      message: consequence.message ?? wrongChoice.outcome,
      severity: interaction.severity,
    },
  ]
  if (!['glitch', 'antagonist', 'account_compromise'].includes(consequence.kind)) {
    nextConsequences.push({
      encounterId: action.scenarioId,
      kind: 'glitch',
      message: 'The phone briefly distorts after the unsafe interaction.',
      severity: interaction.severity,
    })
  }

  return {
    ...state,
    performedPhoneInteractions: {
      ...state.performedPhoneInteractions,
      [action.scenarioId]: [...completedInteractions, interaction.id],
    },
    corruptionByScenario: {
      ...state.corruptionByScenario,
      [action.scenarioId]: corruptionLevel,
    },
    consequences: nextConsequences,
    walletBalance: consequence.kind === 'balance_loss' && consequence.amount
      ? Math.max(0, state.walletBalance - consequence.amount)
      : state.walletBalance,
    accountSecurity: consequence.kind === 'account_compromise'
      ? Math.max(0, state.accountSecurity - (consequence.amount ?? 20))
      : state.accountSecurity,
    resolutionActionFeedback: {
      scenarioId: action.scenarioId,
      actionId: entry.action.id,
      stepId: expectedStep.id,
      outcome: 'rejected',
      message: consequence.message ?? wrongChoice.outcome,
      corruptionLevel,
    },
    lastProgressAt: action.now,
  }
}

function choose(state: GameState, choiceId: string, now: number, decisionId: string | null): GameState {
  const encounter = currentEncounter(state)
  if (!encounter || state.phase !== 'DECISION') return state
  if (decisionId === null || decisionId !== state.narrative.pendingDecisionId) return state
  const check = checkDecision(state, decisionId)
  if (!check.ok || check.decision.encounterId !== encounter.id) return state
  if (state.completedEncounters.includes(encounter.id)) return state
  if (!check.decision.choiceIds.includes(choiceId)) return state
  const choice = encounter.choices.find(c => c.id === choiceId)
  if (!choice) return state
  return resolveChoice(state, encounter, check.decision, choice, now)
}

function performProtectiveAction(
  state: GameState,
  action: Extract<GameAction, { type: 'PERFORM_PROTECTIVE_ACTION' }>,
): GameState {
  if (state.runMode !== 'event' || state.phase !== 'INVESTIGATION') return state
  const active = activeScenario(state)
  const entry = getScenarioDefinition(action.scenarioId)
  if (
    !active
    || active.encounterId !== action.scenarioId
    || active.decisionId === null
    || state.completedEncounters.includes(action.scenarioId)
    || !entry
  ) return state

  if (entry.action.id !== action.actionId) {
    return rejectProtectiveAction(state, entry.scenarioId, entry.action.id, entry.action.steps[state.resolutionSteps[action.scenarioId]?.length ?? 0])
  }
  const completed = state.resolutionSteps[action.scenarioId] ?? []
  if (completed.includes(action.stepId)) return state
  const step = entry.action.steps[completed.length]
  if (!step) return state
  if (step.id !== action.stepId || step.surface !== action.surface) {
    return rejectProtectiveAction(state, entry.scenarioId, entry.action.id, step)
  }

  const completedSteps = [...completed, step.id]
  const actionComplete = completedSteps.length === entry.action.steps.length
  const next: GameState = {
    ...state,
    resolutionSteps: { ...state.resolutionSteps, [action.scenarioId]: completedSteps },
    resolutionActionFeedback: {
      scenarioId: action.scenarioId,
      actionId: action.actionId,
      stepId: step.id,
      outcome: actionComplete ? 'resolved' : 'step-completed',
      message: step.confirmation,
    },
    lastProgressAt: action.now,
  }
  if (!actionComplete) return next

  const narrative = getEncounterNarrative(action.scenarioId)
  const encounter = entry.encounter
  const decision = narrative?.decision
  const choice = encounter.choices.find(candidate => candidate.id === entry.action.authoredChoiceId)
  if (!decision || decision.id !== active.decisionId || !choice?.isCorrect) return state
  return resolveChoice(next, encounter, decision, choice, action.now)
}

function rejectProtectiveAction(
  state: GameState,
  scenarioId: ScenarioId,
  actionId: ResolutionActionId,
  expectedStep: { id: string } | undefined,
): GameState {
  if (!expectedStep) return state
  return {
    ...state,
    resolutionActionFeedback: {
      scenarioId,
      actionId,
      stepId: expectedStep.id,
      outcome: 'rejected',
      message: 'That action had no effect. The incident is still active.',
    },
  }
}

function resolveChoice(
  state: GameState,
  encounter: Encounter,
  decision: NonNullable<ReturnType<typeof getEncounterNarrative>>['decision'],
  choice: Encounter['choices'][number],
  now: number,
): GameState {
  const scoredState = settleClues(state, now)
  const keyEvidence = encounter.artifacts.filter(a => a.isKeyEvidence)
  const inspectedKeyEvidence = keyEvidence.filter(a => scoredState.inspectedArtifacts.includes(a.id)).length
  const hintsUsed = scoredState.hintsUsed[encounter.id] ?? 0
  const secondsTaken = scoredState.encounterStartedAt === null ? 0 : Math.max(0, (now - scoredState.encounterStartedAt) / 1000)

  const score = scoreDecision({
    correct: choice.isCorrect,
    secondsTaken,
    inspectedKeyEvidence,
    totalKeyEvidence: keyEvidence.length,
    hintsUsed,
  })

  const record: DecisionRecord = {
    encounterId: encounter.id,
    archetype: encounter.archetype,
    category: encounter.category,
    choiceId: choice.id,
    correct: choice.isCorrect,
    secondsTaken: Math.round(secondsTaken * 10) / 10,
    inspectedKeyEvidence,
    totalKeyEvidence: keyEvidence.length,
    hintsUsed,
    score,
  }

  // Soft consequences (GDD 9.2): they change the phone, never end the run.
  const { kind, amount, message } = choice.consequence
  let walletBalance = state.walletBalance
  let accountSecurity = state.accountSecurity
  if (kind === 'balance_loss' && amount) walletBalance = Math.max(0, walletBalance - amount)
  if (kind === 'account_compromise') accountSecurity = Math.max(0, accountSecurity - (amount ?? 20))
  const consequences: AppliedConsequence[] =
    kind === 'none' ? state.consequences : [...state.consequences, { encounterId: encounter.id, kind, amount, message }]

  return submitDecision(
    {
      ...scoredState,
      phase: 'CONSEQUENCE',
      clueViewing: {},
      completedEncounters: [...scoredState.completedEncounters, encounter.id],
      decisionHistory: [...scoredState.decisionHistory, record],
      playerScore: scoredState.playerScore + score.total,
      walletBalance,
      accountSecurity,
      consequences,
    },
    decision,
    choice.id,
    choice.isCorrect,
  )
}
