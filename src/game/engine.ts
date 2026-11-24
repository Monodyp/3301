// The game engine: one reducer that owns all run state.
//
// Every change goes through gameReducer(state, action). Actions that are not
// allowed in the current phase are ignored (the same state object comes back),
// so a double tap or a stale button can never skip ahead, complete an encounter
// twice, or finish the run early. Use canDispatch() to grey out buttons.
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
} from './types.ts'
import { CHARACTERS } from './content/index.ts'
import { createRng, pick, shuffle } from './random.ts'
import { scoreDecision } from './scoring.ts'

export const SAVE_VERSION = 2
export const ENCOUNTERS_PER_RUN = 8

export type GameAction =
  | { type: 'START_RUN'; seed: number; now: number; characterId?: string }
  | { type: 'ENTER_PHONE' }
  | { type: 'TRIGGER_ENCOUNTER' }
  | { type: 'BEGIN_INVESTIGATION'; now: number }
  | { type: 'INSPECT_ARTIFACT'; artifactId: string; now: number }
  | { type: 'USE_HINT'; now: number }
  | { type: 'OPEN_DECISION' }
  | { type: 'BACK_TO_INVESTIGATION' }
  | { type: 'CHOOSE'; choiceId: string; now: number }
  | { type: 'CONTINUE' } // CONSEQUENCE -> ENCOUNTER_COMPLETE
  | { type: 'NEXT_ENCOUNTER'; now: number } // ENCOUNTER_COMPLETE -> PHONE_IDLE or RESULTS
  | { type: 'PLAY_AGAIN'; seed: number; now: number }
  | { type: 'COMPLETE_SECURITY_TASK'; taskId: string }
  // Dev-panel only:
  | { type: 'DEV_JUMP_TO_ENCOUNTER'; index: number }
  | { type: 'DEV_RESET' }

// Which actions each phase accepts. Anything else is ignored.
const ALLOWED: Record<GamePhase, readonly GameAction['type'][]> = {
  MAIN_MENU: ['START_RUN'],
  CHARACTER_ASSIGNMENT: ['ENTER_PHONE', 'COMPLETE_SECURITY_TASK'],
  PHONE_IDLE: ['TRIGGER_ENCOUNTER', 'COMPLETE_SECURITY_TASK'],
  ENCOUNTER_INTRO: ['BEGIN_INVESTIGATION', 'COMPLETE_SECURITY_TASK'],
  INVESTIGATION: ['INSPECT_ARTIFACT', 'USE_HINT', 'OPEN_DECISION', 'COMPLETE_SECURITY_TASK'],
  DECISION: ['INSPECT_ARTIFACT', 'USE_HINT', 'BACK_TO_INVESTIGATION', 'CHOOSE', 'COMPLETE_SECURITY_TASK'],
  CONSEQUENCE: ['CONTINUE', 'COMPLETE_SECURITY_TASK'],
  ENCOUNTER_COMPLETE: ['NEXT_ENCOUNTER', 'COMPLETE_SECURITY_TASK'],
  RESULTS: ['PLAY_AGAIN'],
}

const DEV_ACTIONS: readonly GameAction['type'][] = ['DEV_JUMP_TO_ENCOUNTER', 'DEV_RESET']

export function initialGameState(): GameState {
  return {
    saveVersion: SAVE_VERSION,
    phase: 'MAIN_MENU',
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
  }
}

export function canDispatch(state: GameState, type: GameAction['type']): boolean {
  return DEV_ACTIONS.includes(type) || ALLOWED[state.phase].includes(type)
}

// ---------------------------------------------------------------- selectors

export function currentCharacter(state: GameState): Character | undefined {
  return CHARACTERS.find(c => c.id === state.characterId)
}

export function currentEncounter(state: GameState): Encounter | undefined {
  const id = state.encounterQueue[state.currentEncounterIndex]
  return currentCharacter(state)?.encounters.find(e => e.id === id)
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

  const encounterQueue = shuffle(character.encounters.map(e => e.id), rng)
  const choiceOrder: Record<string, string[]> = {}
  const choiceRng = createRng((seed ^ 0x9e3779b9) >>> 0)
  for (const e of character.encounters) {
    choiceOrder[e.id] = shuffle(e.choices.map(c => c.id), choiceRng)
  }

  return {
    ...initialGameState(),
    phase: 'CHARACTER_ASSIGNMENT',
    sessionId: `run-${seed.toString(36)}-${now.toString(36)}`,
    seed,
    characterId: character.id,
    previousCharacterId,
    encounterQueue,
    choiceOrder,
    walletBalance: character.startingBalance,
    runStartedAt: now,
  }
}

// ---------------------------------------------------------------- reducer

export function gameReducer(state: GameState, action: GameAction): GameState {
  if (!canDispatch(state, action.type)) return state

  switch (action.type) {
    case 'START_RUN':
      return newRun(action.seed, action.now, state.previousCharacterId, action.characterId) ?? state

    case 'PLAY_AGAIN':
      return newRun(action.seed, action.now, state.characterId) ?? state

    case 'ENTER_PHONE':
      return { ...state, phase: 'PHONE_IDLE' }

    case 'TRIGGER_ENCOUNTER':
      if (!currentEncounter(state)) return state
      return { ...state, phase: 'ENCOUNTER_INTRO' }

    case 'BEGIN_INVESTIGATION':
      return { ...state, phase: 'INVESTIGATION', encounterStartedAt: action.now, lastProgressAt: action.now }

    case 'INSPECT_ARTIFACT': {
      const encounter = currentEncounter(state)
      if (!encounter) return state
      if (!encounter.artifacts.some(a => a.id === action.artifactId)) return state
      if (state.inspectedArtifacts.includes(action.artifactId)) return state
      return {
        ...state,
        inspectedArtifacts: [...state.inspectedArtifacts, action.artifactId],
        lastProgressAt: action.now,
      }
    }

    case 'USE_HINT': {
      const encounter = currentEncounter(state)
      if (!encounter) return state
      const used = state.hintsUsed[encounter.id] ?? 0
      if (used >= encounter.hints.length) return state
      return { ...state, hintsUsed: { ...state.hintsUsed, [encounter.id]: used + 1 }, lastProgressAt: action.now }
    }

    case 'OPEN_DECISION':
      return { ...state, phase: 'DECISION' }

    case 'BACK_TO_INVESTIGATION':
      return { ...state, phase: 'INVESTIGATION' }

    case 'CHOOSE':
      return choose(state, action.choiceId, action.now)

    case 'CONTINUE':
      return { ...state, phase: 'ENCOUNTER_COMPLETE' }

    case 'NEXT_ENCOUNTER': {
      const nextIndex = state.currentEncounterIndex + 1
      if (state.completedEncounters.length >= ENCOUNTERS_PER_RUN || nextIndex >= state.encounterQueue.length) {
        return { ...state, phase: 'RESULTS', encounterStartedAt: null, lastProgressAt: null, runFinishedAt: action.now }
      }
      return { ...state, phase: 'PHONE_IDLE', currentEncounterIndex: nextIndex, encounterStartedAt: null, lastProgressAt: null }
    }


    case 'DEV_JUMP_TO_ENCOUNTER': {
      if (!state.characterId) return state
      if (action.index < 0 || action.index >= state.encounterQueue.length) return state
      return { ...state, phase: 'PHONE_IDLE', currentEncounterIndex: action.index, encounterStartedAt: null, lastProgressAt: null }
    }

    case 'DEV_RESET':
      return initialGameState()
    case 'COMPLETE_SECURITY_TASK':
      if (state.completedSecurityTasks.includes(action.taskId)) return state
      return { ...state, completedSecurityTasks: [...state.completedSecurityTasks, action.taskId] }
  }
}

function choose(state: GameState, choiceId: string, now: number): GameState {
  const encounter = currentEncounter(state)
  if (!encounter) return state
  if (state.completedEncounters.includes(encounter.id)) return state
  const choice = encounter.choices.find(c => c.id === choiceId)
  if (!choice) return state

  const keyEvidence = encounter.artifacts.filter(a => a.isKeyEvidence)
  const inspectedKeyEvidence = keyEvidence.filter(a => state.inspectedArtifacts.includes(a.id)).length
  const hintsUsed = state.hintsUsed[encounter.id] ?? 0
  const secondsTaken = state.encounterStartedAt === null ? 0 : Math.max(0, (now - state.encounterStartedAt) / 1000)

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

  return {
    ...state,
    phase: 'CONSEQUENCE',
    completedEncounters: [...state.completedEncounters, encounter.id],
    decisionHistory: [...state.decisionHistory, record],
    playerScore: state.playerScore + score.total,
    walletBalance,
    accountSecurity,
    consequences,
  }
}
