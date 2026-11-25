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
  advertisement?: EncounterAdvertisement
  incomingCall?: EncounterIncomingCall
}

export interface EncounterAdvertisement {
  id: string
  title: string
  description: string
  destination: string
  suspicious: boolean
  artifactId?: string
  encounterId: string
}

export interface EncounterIncomingCall {
  caller: string
  context: string
  content: string
  voicemail: string
  callerColor?: string
  artifactId?: string
  encounterId: string
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
  | 'RESULTS'

// ---------------------------------------------------------------- narrative
//
// Narrative progression is data. Each encounter is split into scenarios
// (content/scenarios.ts). A scenario lists the phone events the player must
// cause, the narrative content those events present, the evidence it needs and
// the decision it unlocks, if any. The reducer is the only thing that moves
// encounters and scenarios forward; screens only report what the player did.

// Something meaningful the player did on the phone. Screens report these; the
// engine compares them with the active scenario's required actions and ignores
// anything else, so browsing unrelated content can never move the story on.
export type PhoneEventKind =
  | 'CONVERSATION_OPENED' // opened a specific conversation, email, post, page or call screen
  | 'MESSAGE_READ' // reached the end of a conversation, or played a voicemail
  | 'ATTACHMENT_OPENED'
  | 'ARTIFACT_VIEWED' // target is artifact:<artifact id>; same as INSPECT_ARTIFACT
  | 'CALL_COMPLETED' // answered a call and heard it through to the end
  | 'INFORMATION_DISCOVERED'

export interface PhoneEvent {
  kind: PhoneEventKind
  app: AppId
  target: string // see PHONE_TARGETS in narrative.ts
}

// A piece of authored narrative the player must have been shown.
export interface NarrativeContentRef {
  id: string // '<encounter id>:incident-notice'
  source: 'trigger' | 'thread' | 'incomingCall' // which field of the Encounter holds the text
  app: AppId // where the player sees it
}

// One required player action. Any one of the listed events completes it.
export interface ScenarioAction {
  id: string // '<scenario id>-open'
  description: string // for the dev panel and reports, never shown as story text
  anyOf: PhoneEvent[]
  presents: string[] // NarrativeContentRef ids the player has seen once this is done
}

export type ScenarioStart =
  | { kind: 'incident-delivered' } // the encounter's trigger notification has arrived
  | { kind: 'scenario-completed'; scenarioId: string }

export type ScenarioNext = { kind: 'scenario'; scenarioId: string } | { kind: 'next-encounter' }

export interface ScenarioDefinition {
  id: string // 'MK-A1-S1'
  encounterId: string
  characterId: string
  title: string
  narrativeContent: NarrativeContentRef[] // required narrative content
  requiredActions: ScenarioAction[] // required player actions
  startsWhen: ScenarioStart // trigger condition
  requiredEvidence: string[] // artifact ids; any order
  decisionId: string | null
  completesWhen: 'actions-complete' | 'decision-submitted'
  next: ScenarioNext
}

export interface DecisionDefinition {
  id: string // 'MK-A1-D1'
  characterId: string
  encounterId: string
  scenarioId: string
  prompt: string
  choiceIds: string[]
}

export interface EncounterNarrative {
  encounterId: string
  characterId: string
  requiresEncounters: string[] // encounters that must be resolved before this one unlocks
  scenarios: ScenarioDefinition[] // in play order
  decision: DecisionDefinition
  gaps: string[] // authored content that exists but has no scenario role yet, or is missing
}

export type EncounterLifecycle =
  | 'LOCKED' // prerequisites not met
  | 'AVAILABLE' // unlocked; the incident has not arrived yet
  | 'DELIVERED' // the trigger notification has arrived; first scenario active
  | 'INVESTIGATING'
  | 'DECISION_PENDING' // a validated decision is waiting for the player
  | 'FEEDBACK' // decision submitted, feedback on screen
  | 'RESOLVED'

export type ScenarioLifecycle = 'LOCKED' | 'ACTIVE' | 'COMPLETE'

export interface EncounterResolution {
  decisionId: string
  choiceId: string
  correct: boolean
}

export interface ResolutionActionFeedback {
  scenarioId: string
  actionId: string
  stepId: string
  outcome: 'step-completed' | 'resolved' | 'rejected'
  message: string
}

export interface NarrativeState {
  activeEncounterId: string | null
  activeScenarioId: string | null
  encounterLifecycle: Record<string, EncounterLifecycle>
  scenarioLifecycle: Record<string, ScenarioLifecycle>
  completedActions: Record<string, string[]> // scenario id -> completed ScenarioAction ids, in order
  presentedNarrative: string[] // NarrativeContentRef ids
  pendingDecisionId: string | null
  submittedDecisionIds: string[]
  encounterResolution: Record<string, EncounterResolution>
}
// Discovered evidence is GameState.inspectedArtifacts; only the engine adds to it.

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
  // Event players are independent from the NPC identity of each encounter.
  runMode: 'practice' | 'event' | null
  eventRunId: string | null
  sessionId: string | null
  seed: number | null
  characterId: string | null // local-practice assignment only; null for event runs
  previousCharacterId: string | null // so "Play again" can give a different character
  encounterQueue: string[] // shuffled practice IDs or ordered backend event assignment
  choiceOrder: Record<string, string[]> // encounter id -> shuffled choice ids
  currentEncounterIndex: number
  completedEncounters: string[]
  inspectedArtifacts: string[] // discovered evidence, in discovery order
  hintsUsed: Record<string, number> // encounter id -> hints shown
  decisionHistory: DecisionRecord[]
  consequences: AppliedConsequence[]
  playerScore: number
  walletBalance: number
  accountSecurity: number // 0–100
  runStartedAt: number | null
  encounterStartedAt: number | null // when investigation began
  lastProgressAt: number | null // last new evidence or hint; hints wait for the player to stall after this
  runFinishedAt: number | null
  completedSecurityTasks: string[]
  narrative: NarrativeState
  resolutionSteps: Record<string, string[]>
  resolutionActionFeedback: ResolutionActionFeedback | null
  // Clue content currently on screen: artifact id -> when it became visible.
  // Cleared whenever the content leaves the screen, and on refresh.
  clueViewing: Record<string, number>
  // Scripted cyberattack progression (see attacks.ts). Independent of decision results.
  attacks: AttackProgress
}

export interface AttackProgress {
  triggered: string[] // attack ids, in the order they happened
  resolved: string[] // attacks whose incident decision has been submitted
  notified: string[] // attacks whose notification has been shown
}

export type SurvivalRating =
  | 'FULLY SECURED'
  | 'MOSTLY SECURED'
  | 'PARTIALLY COMPROMISED'
  | 'CRITICAL'
  | 'BLACKED OUT'
