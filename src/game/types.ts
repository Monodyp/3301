// Core data types for 3301's game engine.
//
// Content (characters, encounters) is plain data that follows these types,
// so writing a new character never means touching engine code.
// Screens read GameState; they never keep their own copy of progress.

import type { AppId, HorrorStage } from '../types/index.ts'

export type { AppId, HorrorStage }

export type Category = 'awareness' | 'responsibility' | 'opportunity'

export type Archetype = 'A1' | 'A2' | 'A3' | 'R1' | 'R2' | 'R3' | 'O1' | 'O2'

export const ARCHETYPES: readonly Archetype[] = ['A1', 'A2', 'A3', 'R1', 'R2', 'R3', 'O1', 'O2']

export const CATEGORY_OF: Record<Archetype, Category> = {
  A1: 'awareness',
  A2: 'awareness',
  A3: 'awareness',
  R1: 'responsibility',
  R2: 'responsibility',
  R3: 'responsibility',
  O1: 'opportunity',
  O2: 'opportunity',
}

// ---------------------------------------------------------------- content

export interface Character {
  id: string // 'mika'
  number: number // 1–25, order in the Character directory
  name: string
  archetype: string // 'Aspiring Streamer'
  age?: number
  occupation: string
  goal: string
  background: string
  objective: string // the short line shown in the objective indicator
  apps: AppId[] // apps this character's phone shows
  startingBalance: number // pesos, for the Wallet
  encounters: Encounter[] // exactly 8, one per archetype
}

export interface ThreadMessage {
  from: 'them' | 'me' | 'system'
  sender?: string
  text: string
  time?: string
}

export interface Artifact {
  id: string // 'MK-A1-ART-01'
  label: string // what the tappable evidence is called
  app: AppId // where the player finds it
  detail: string // what the player learns when they inspect it
  isKeyEvidence: boolean // counts toward the clue bonus
}

export type ConsequenceKind =
  | 'none'
  | 'glitch' // brief screen interference
  | 'pressure' // the attacker sends a more demanding follow-up
  | 'antagonist' // a message from the unknown presence
  | 'balance_loss' // simulated money leaves the wallet
  | 'account_compromise' // account security drops

export interface Consequence {
  kind: ConsequenceKind
  message?: string // text the phone shows for this effect
  amount?: number // pesos for balance_loss, security points for account_compromise
}

export interface DecisionOption {
  id: string // stable id, never shown; choices are shuffled per player
  text: string
  isCorrect: boolean
  outcome: string // one line: what happened because of this choice
  consequence: Consequence
}

export interface Feedback {
  principle: string // the security lesson
  recommendedAction: string // one thing to do in real life
}

export type ClueGroup = 'PBI-01' | 'PBI-02' | 'PBI-03' | 'PBI-04' | 'PBI-05'

export interface BlackoutClue {
  id: string // unique per encounter, e.g. 'MK-PBI-01-A1'
  group: ClueGroup // Profiling, Relationship mapping, Vulnerability mapping, Influence, Campaign attribution
  fragment: string // the line shown in the Project Blackout directory
  requires: string[] // artifact ids that must all be inspected to unlock it
}

export interface Hint {
  afterSeconds: number // shown only if the player is still investigating after this long
  text: string
  app?: AppId // points the player to an app
  highlightArtifactId?: string // last-resort hint: glow this artifact
}

export interface EncounterTrigger {
  app: AppId
  sender: string
  title: string
  message: string
}

export interface Encounter {
  id: string // 'MK-A1'
  characterId: string
  archetype: Archetype
  category: Category
  title: string
  lesson: string
  trigger: EncounterTrigger
  thread: ThreadMessage[]
  artifacts: Artifact[]
  prompt: string
  choices: DecisionOption[] // exactly one has isCorrect: true
  feedback: Feedback
  clue: BlackoutClue
  hints: Hint[]
}

// ---------------------------------------------------------------- state

export type GamePhase =
  | 'MAIN_MENU'
  | 'CHARACTER_ASSIGNMENT' // profile card on screen
  | 'PHONE_IDLE' // free exploration between encounters
  | 'ENCOUNTER_INTRO' // trigger notification has arrived
  | 'INVESTIGATION'
  | 'DECISION'
  | 'CONSEQUENCE' // outcome and feedback card
  | 'ENCOUNTER_COMPLETE'
  | 'FINAL_REVEAL'
  | 'RESULTS'

export interface ScoreBreakdown {
  base: number // 100 if correct, else 0
  timeBonus: number // 0–25, correct decisions only
  clueBonus: number // 0–10, from investigation, minus hints used
  total: number
}

export interface DecisionRecord {
  encounterId: string
  archetype: Archetype
  category: Category
  choiceId: string
  correct: boolean
  secondsTaken: number
  inspectedKeyEvidence: number
  totalKeyEvidence: number
  hintsUsed: number
  score: ScoreBreakdown
}

export interface AppliedConsequence {
  encounterId: string
  kind: ConsequenceKind
  message?: string
  amount?: number
}

export interface GameState {
  saveVersion: number
  phase: GamePhase
  sessionId: string | null
  seed: number | null
  characterId: string | null
  previousCharacterId: string | null // so "Play again" can give a different character
  encounterQueue: string[] // shuffled encounter ids
  choiceOrder: Record<string, string[]> // encounter id -> shuffled choice ids
  currentEncounterIndex: number
  completedEncounters: string[]
  inspectedArtifacts: string[]
  hintsUsed: Record<string, number> // encounter id -> hints shown
  decisionHistory: DecisionRecord[]
  consequences: AppliedConsequence[]
  blackoutClues: string[] // unlocked clue ids
  playerScore: number
  walletBalance: number
  accountSecurity: number // 0–100
  runStartedAt: number | null
  encounterStartedAt: number | null // when investigation began
  lastProgressAt: number | null // last new evidence or hint; hints wait for the player to stall after this
  runFinishedAt: number | null
}

export type SurvivalRating =
  | 'FULLY SECURED'
  | 'MOSTLY SECURED'
  | 'PARTIALLY COMPROMISED'
  | 'CRITICAL'
  | 'BLACKED OUT'
