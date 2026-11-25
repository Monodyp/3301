// Scripted cyberattack progression.
//
// Every encounter's incident is a cyberattack on the character. The attacks
// happen in the run's encounter order whatever the player decides: a decision
// changes the outcome of an incident (score, feedback, consequences), never
// whether the next attack comes.
//
//   trigger     the encounter's incident is delivered (its trigger notification
//               arrives), and every earlier attack is resolved
//   resolution  the encounter's decision is submitted (correct or not)
//
// Attack N therefore arrives after attack N-1's decision and feedback, when the
// engine delivers the next incident. Progression has its own state
// (GameState.attacks) and is evaluated from narrative events only; nothing here
// looks at decision results or consequences.
//
// Title and message are the incident's authored trigger notification; the
// escalation tier comes from the attack's position in the run.

import type { AppId, AttackProgress, EncounterLifecycle, GamePhase, GameState } from './types.ts'
import { SCENARIO_REGISTRY } from './scenarioRegistry.ts'

export type AttackTier = 1 | 2 | 3 | 4

export const ATTACK_TIER_LABEL: Record<AttackTier, string> = {
  1: 'Anomaly',
  2: 'Intrusion',
  3: 'Compromise',
  4: 'Escalation',
}

export interface AttackDefinition {
  id: string // 'attack-<encounter id>'
  characterId: string
  encounterId: string
  trigger: { kind: 'incident-delivered'; encounterId: string }
  resolution: { kind: 'decision-submitted'; decisionId: string }
  title: string // authored: Encounter.trigger.title
  message: string // authored: Encounter.trigger.message
  sender: string
  app: AppId
}

function buildDefinitions(): Map<string, AttackDefinition> {
  const all = new Map<string, AttackDefinition>()
  for (const { encounter, npcIdentity } of SCENARIO_REGISTRY) {
    const id = `attack-${encounter.id}`
    all.set(id, {
      id,
      characterId: npcIdentity,
      encounterId: encounter.id,
      trigger: { kind: 'incident-delivered', encounterId: encounter.id },
      resolution: { kind: 'decision-submitted', decisionId: `${encounter.id}-D1` },
      title: encounter.trigger.title,
      message: encounter.trigger.message,
      sender: encounter.trigger.sender,
      app: encounter.trigger.app,
    })
  }
  return all
}

export const ATTACK_DEFINITIONS: ReadonlyMap<string, AttackDefinition> = buildDefinitions()

export const attackIdFor = (encounterId: string) => `attack-${encounterId}`

export function initialAttackProgress(): AttackProgress {
  return { triggered: [], resolved: [], notified: [] }
}

export function attackTier(ordinal: number): AttackTier {
  return ordinal >= 4 ? 4 : (Math.max(1, ordinal) as AttackTier)
}

// ---------------------------------------------------------------- progression

const DELIVERED: readonly EncounterLifecycle[] = ['DELIVERED', 'INVESTIGATING', 'DECISION_PENDING', 'FEEDBACK', 'RESOLVED']

function triggerMet(state: GameState, attack: AttackDefinition): boolean {
  return state.encounterQueue.includes(attack.encounterId)
    && DELIVERED.includes(state.narrative.encounterLifecycle[attack.trigger.encounterId])
}

function resolutionMet(state: GameState, attack: AttackDefinition): boolean {
  return state.narrative.submittedDecisionIds.includes(attack.resolution.decisionId)
}

// Brings attack progress up to date with the narrative. Idempotent: returns
// the same state object when nothing changed. Called by the reducer after
// every action.
export function advanceAttacks(state: GameState): GameState {
  let { triggered, resolved } = state.attacks
  let changed = false
  // Resolve attacks whose decision has been submitted.
  for (const id of triggered) {
    const attack = ATTACK_DEFINITIONS.get(id)
    if (attack && !resolved.includes(id) && resolutionMet(state, attack)) {
      resolved = [...resolved, id]
      changed = true
    }
  }
  // Trigger the active encounter's attack once every earlier attack is resolved.
  const encounterId = state.narrative.activeEncounterId
  const attack = encounterId ? ATTACK_DEFINITIONS.get(attackIdFor(encounterId)) : undefined
  if (attack && !triggered.includes(attack.id) && triggered.every(id => resolved.includes(id)) && triggerMet(state, attack)) {
    triggered = [...triggered, attack.id]
    changed = true
    if (resolutionMet(state, attack)) resolved = [...resolved, attack.id]
  }
  return changed ? { ...state, attacks: { ...state.attacks, triggered, resolved } } : state
}

// Marks the next attack's notification as shown. Only the earliest unshown
// attack is accepted, and only once.
export function markAttackNotified(state: GameState, attackId: string): GameState {
  const next = state.attacks.triggered.find(id => !state.attacks.notified.includes(id))
  if (next !== attackId) return state
  return { ...state, attacks: { ...state.attacks, notified: [...state.attacks.notified, attackId] } }
}

// A save from before scripted attacks: earlier, already resolved encounters are
// recorded as attacks already shown (so they are not replayed), then progress
// is brought up to date.
export function reconcileAttacks(state: GameState, hadAttackState: boolean): GameState {
  if (hadAttackState) return advanceAttacks(state)
  const past = state.encounterQueue
    .slice(0, state.currentEncounterIndex)
    .filter(id => state.narrative.encounterLifecycle[id] === 'RESOLVED')
    .map(attackIdFor)
  return advanceAttacks({ ...state, attacks: { triggered: past, resolved: past, notified: past } })
}

// ---------------------------------------------------------------- views

export interface AttackEvent {
  id: string
  ordinal: number // 1 for the run's first attack
  tier: AttackTier
  tierLabel: string
  encounterId: string
  app: AppId
  title: string
  message: string
  detail: string
  resolved: boolean
}

// Every attack that has happened this run, in order.
export function attackEvents(state: GameState): AttackEvent[] {
  return state.attacks.triggered.flatMap((id, index) => {
    const attack = ATTACK_DEFINITIONS.get(id)
    if (!attack) return []
    const ordinal = index + 1
    const tier = attackTier(ordinal)
    return [{
      id,
      ordinal,
      tier,
      tierLabel: ATTACK_TIER_LABEL[tier],
      encounterId: attack.encounterId,
      app: attack.app,
      title: attack.title,
      message: attack.message,
      detail: `From ${attack.sender}`,
      resolved: state.attacks.resolved.includes(id),
    }]
  })
}

// Notifications wait while the player reads feedback or answers a decision.
const DEFERRED_IN: readonly GamePhase[] = ['MAIN_MENU', 'CHARACTER_ASSIGNMENT', 'DECISION', 'CONSEQUENCE']

// The earliest attack whose notification has not been shown, if now is a good time.
export function attackNotificationDue(state: GameState): AttackEvent | undefined {
  if (DEFERRED_IN.includes(state.phase)) return undefined
  return attackEvents(state).find(attack => !state.attacks.notified.includes(attack.id))
}
