// Narrative engine and decision-isolation regression tests (stages 1–3).
// A–G match the required cases; the rest cover the controller's building blocks.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { CHARACTERS } from '../src/game/content/index.ts'
import { ENCOUNTER_NARRATIVES, validateNarrative } from '../src/game/content/scenarios.ts'
import { SAVE_VERSION, currentEncounter, gameReducer, initialGameState, orderedChoices } from '../src/game/engine.ts'
import { PHONE_TARGETS, activeScenario, checkDecision, incidentDue, orderByDependencies, pendingDecision } from '../src/game/narrative.ts'
import { loadGame, saveGame } from '../src/game/storage.ts'
import type { GameState } from '../src/game/types.ts'
import {
  T0,
  decisionIdFor,
  findEvidence,
  investigateFully,
  memoryStorage,
  openIncident,
  openPending,
  phoneEvent,
  run,
  takeInNarrative,
} from './support/play.ts'

const mika = CHARACTERS.find(c => c.id === 'mika')!
const rafa = CHARACTERS.find(c => c.id === 'rafa')!

function startedWith(characterId: string, seed: number): GameState {
  return run(initialGameState(), { type: 'START_RUN', seed, now: T0, characterId }, { type: 'ENTER_PHONE' })
}

// First seed whose run satisfies `accept`, so tests can pick a starting encounter deterministically.
function seedWhere(characterId: string, accept: (queue: string[]) => boolean): GameState {
  for (let seed = 1; seed < 5000; seed++) {
    const state = startedWith(characterId, seed)
    if (accept(state.encounterQueue)) return state
  }
  throw new Error('no matching seed')
}

const triggerApp = (encounterId: string) => [...mika.encounters, ...rafa.encounters].find(e => e.id === encounterId)!.trigger.app

// Mika's ambient "package" content: Mara's conversation and M. Rowan's email.
const PACKAGE_EVENTS = [
  { kind: 'CONVERSATION_OPENED', app: 'messages', target: PHONE_TARGETS.ambient('messages', 1) },
  { kind: 'MESSAGE_READ', app: 'messages', target: PHONE_TARGETS.ambient('messages', 1) },
  { kind: 'CONVERSATION_OPENED', app: 'email', target: PHONE_TARGETS.ambient('email', 2) },
  { kind: 'MESSAGE_READ', app: 'email', target: PHONE_TARGETS.ambient('email', 2) },
] as const

// ---------------------------------------------------------------- A

test('A. reading Mika’s package conversation never exposes the loyalty decision (MK-A2) or any other', () => {
  // Case 1: the loyalty encounter is active but undiscovered.
  let state = gameReducer(seedWhere('mika', q => q[0] === 'MK-A2'), { type: 'TRIGGER_ENCOUNTER' })
  assert.equal(currentEncounter(state)!.id, 'MK-A2')
  for (const event of PACKAGE_EVENTS) {
    const after = phoneEvent(state, event)
    assert.equal(after, state, `${event.kind} on ${event.target} must not change narrative state`)
  }
  assert.equal(state.phase, 'ENCOUNTER_INTRO', 'the package conversation does not even open the investigation')
  assert.equal(gameReducer(state, { type: 'OPEN_DECISION', decisionId: 'MK-A2-D1' }), state)

  // Still nothing after the incident is opened: package content is not the community thread.
  state = openIncident(state)
  for (const event of PACKAGE_EVENTS) state = phoneEvent(state, event)
  state = findEvidence(state)
  assert.equal(state.narrative.pendingDecisionId, null)
  assert.equal(checkDecision(state, 'MK-A2-D1').ok, false)
  assert.equal(openPending(state), state)

  // Case 2: a Messages encounter is active and the loyalty encounter is later in the queue.
  let other = gameReducer(seedWhere('mika', q => triggerApp(q[0]) === 'messages' && q.indexOf('MK-A2') > 0), { type: 'TRIGGER_ENCOUNTER' })
  other = openIncident(other)
  for (const event of PACKAGE_EVENTS) other = phoneEvent(other, event)
  assert.equal(other.narrative.pendingDecisionId, null)
  assert.deepEqual(checkDecision(other, 'MK-A2-D1'), { ok: false, reason: 'inactive-encounter' })
  assert.equal(gameReducer(other, { type: 'OPEN_DECISION', decisionId: 'MK-A2-D1' }), other)
})

// ---------------------------------------------------------------- B

test('B. a decision becomes available only after its exact scenario and required actions are complete', () => {
  for (const character of CHARACTERS) {
    let state = startedWith(character.id, 31)
    for (let i = 0; i < state.encounterQueue.length; i++) {
      const encounter = currentEncounter(state)!
      const decisionId = decisionIdFor(encounter.id)
      const expectRejected = (reason: string, label: string) => {
        assert.equal(state.narrative.pendingDecisionId, null, `${encounter.id}: no pending decision ${label}`)
        const check = checkDecision(state, decisionId)
        assert.equal(check.ok ? 'ok' : check.reason, reason, `${encounter.id}: ${label}`)
        assert.equal(gameReducer(state, { type: 'OPEN_DECISION', decisionId }), state, `${encounter.id}: cannot open ${label}`)
      }

      expectRejected('inactive-scenario', 'before the incident arrives')
      state = gameReducer(state, { type: 'TRIGGER_ENCOUNTER' })
      expectRejected('inactive-scenario', 'while only the notification has arrived')
      state = openIncident(state, T0 + i)
      assert.equal(activeScenario(state)!.id, `${encounter.id}-S2`)
      expectRejected('actions-incomplete', 'before the narrative is taken in')
      state = takeInNarrative(state)
      const keys = encounter.artifacts.filter(a => a.isKeyEvidence)
      for (const artifact of keys.slice(0, -1)) {
        expectRejected('evidence-missing', `with ${artifact.id} still to find`)
        state = gameReducer(state, { type: 'INSPECT_ARTIFACT', artifactId: artifact.id, now: T0 })
      }
      expectRejected('evidence-missing', 'with one artifact left')
      state = gameReducer(state, { type: 'INSPECT_ARTIFACT', artifactId: keys[keys.length - 1].id, now: T0 })

      assert.equal(state.narrative.pendingDecisionId, decisionId)
      assert.equal(state.narrative.encounterLifecycle[encounter.id], 'DECISION_PENDING')
      state = gameReducer(state, { type: 'OPEN_DECISION', decisionId })
      assert.equal(state.phase, 'DECISION')
      const choice = orderedChoices(state)[0]
      state = run(state, { type: 'CHOOSE', choiceId: choice.id, decisionId, now: T0 + 1000 }, { type: 'CONTINUE' }, { type: 'NEXT_ENCOUNTER', now: T0 + 2000 })
    }
    assert.equal(state.phase, 'RESULTS')
    assert.equal(state.narrative.submittedDecisionIds.length, 8)
  }
})

// ---------------------------------------------------------------- C

test('C. a decision from a future encounter cannot be opened or answered', () => {
  let state = investigateFully(startedWith('mika', 8))
  const current = currentEncounter(state)!
  const futureIds = state.encounterQueue.slice(1)
  assert.equal(state.narrative.pendingDecisionId, decisionIdFor(current.id))

  for (const futureId of futureIds) {
    const decisionId = decisionIdFor(futureId)
    assert.equal(state.narrative.encounterLifecycle[futureId], 'LOCKED')
    assert.deepEqual(checkDecision(state, decisionId), { ok: false, reason: 'inactive-encounter' })
    assert.equal(gameReducer(state, { type: 'OPEN_DECISION', decisionId }), state, `${decisionId} must stay closed`)
  }

  // Even with the current decision sheet open, a future decision's choice is refused.
  state = openPending(state)
  assert.equal(state.phase, 'DECISION')
  const future = mika.encounters.find(e => e.id === futureIds[0])!
  assert.equal(gameReducer(state, { type: 'CHOOSE', choiceId: future.choices[0].id, now: T0 }), state)
  assert.equal(gameReducer(state, { type: 'CHOOSE', choiceId: future.choices[0].id, decisionId: decisionIdFor(future.id), now: T0 }), state)
  assert.equal(gameReducer(state, { type: 'CHOOSE', choiceId: current.choices[0].id, decisionId: decisionIdFor(future.id), now: T0 }), state)

  // A future incident cannot be reached by its phone events either.
  const futureEvent = { kind: 'CONVERSATION_OPENED', app: future.trigger.app, target: PHONE_TARGETS.incident(future.id) } as const
  assert.equal(phoneEvent(state, futureEvent), state)
})

// ---------------------------------------------------------------- D

test('D. Mika cannot open or answer any of Rafa’s decisions, and Rafa cannot open Mika’s', () => {
  const check = (state: GameState, other: typeof rafa) => {
    for (const encounter of other.encounters) {
      const decisionId = decisionIdFor(encounter.id)
      assert.deepEqual(checkDecision(state, decisionId), { ok: false, reason: 'wrong-character' })
      assert.equal(gameReducer(state, { type: 'OPEN_DECISION', decisionId }), state)
      assert.equal(phoneEvent(state, { kind: 'CONVERSATION_OPENED', app: encounter.trigger.app, target: PHONE_TARGETS.incident(encounter.id) }), state)
    }
    const open = openPending(state)
    assert.equal(open.phase, 'DECISION')
    for (const encounter of other.encounters) {
      for (const choice of encounter.choices) {
        assert.equal(gameReducer(open, { type: 'CHOOSE', choiceId: choice.id, now: T0 }), open)
        assert.equal(gameReducer(open, { type: 'CHOOSE', choiceId: choice.id, decisionId: decisionIdFor(encounter.id), now: T0 }), open)
      }
    }
  }
  check(investigateFully(startedWith('mika', 12)), rafa)
  check(investigateFully(startedWith('rafa', 12)), mika)
})

// ---------------------------------------------------------------- E

test('E. closing and reopening keeps the pending decision and evidence without submitting', () => {
  const ready = investigateFully(startedWith('rafa', 21))
  const decisionId = ready.narrative.pendingDecisionId!
  let state = openPending(ready)
  assert.equal(state.phase, 'DECISION')

  state = gameReducer(state, { type: 'BACK_TO_INVESTIGATION' })
  assert.equal(state.phase, 'INVESTIGATION')
  assert.equal(state.narrative.pendingDecisionId, decisionId)
  assert.deepEqual(state.decisionHistory, [])
  assert.deepEqual(state.narrative.submittedDecisionIds, [])
  assert.deepEqual(state.inspectedArtifacts, ready.inspectedArtifacts)
  assert.deepEqual(state.narrative.completedActions, ready.narrative.completedActions)

  // Reopen without repeating anything, then submit once.
  state = gameReducer(state, { type: 'OPEN_DECISION', decisionId })
  assert.equal(state.phase, 'DECISION')
  const [first, second] = orderedChoices(state)
  state = gameReducer(state, { type: 'CHOOSE', choiceId: first.id, now: T0 + 5000 })
  assert.equal(state.phase, 'CONSEQUENCE')
  assert.deepEqual(state.narrative.submittedDecisionIds, [decisionId])

  // Duplicate submissions and reopening are refused.
  assert.equal(gameReducer(state, { type: 'CHOOSE', choiceId: second.id, now: T0 + 6000 }), state)
  const reopened = { ...state, phase: 'DECISION' as const }
  assert.equal(gameReducer(reopened, { type: 'CHOOSE', choiceId: second.id, decisionId, now: T0 + 6000 }), reopened)
  assert.deepEqual(checkDecision({ ...state, phase: 'INVESTIGATION' }, decisionId), { ok: false, reason: 'already-submitted' })
  assert.equal(state.decisionHistory.length, 1)
})

// ---------------------------------------------------------------- F

test('F. actions completed out of order do not unlock a decision early', () => {
  const idle = startedWith('mika', 3)
  const encounter = currentEncounter(idle)!
  const incident = PHONE_TARGETS.incident(encounter.id)
  const read = { kind: 'MESSAGE_READ', app: encounter.trigger.app, target: incident } as const

  // Nothing counts before the incident arrives (events are not even accepted on the idle phone).
  assert.equal(phoneEvent(idle, read), idle)

  // Reading before opening the incident is ignored.
  let state = gameReducer(idle, { type: 'TRIGGER_ENCOUNTER' })
  assert.equal(phoneEvent(state, read), state)
  assert.equal(gameReducer(state, { type: 'INSPECT_ARTIFACT', artifactId: encounter.artifacts[0].id, now: T0 }), state, 'no evidence before the incident is opened')

  // Opening it starts the investigation; the earlier read was not remembered.
  state = openIncident(state)
  assert.equal(state.phase, 'INVESTIGATION')
  assert.deepEqual(state.narrative.completedActions[`${encounter.id}-S2`] ?? [], [])

  // All evidence first, narrative last: still locked until the narrative is taken in.
  state = findEvidence(state)
  assert.equal(state.narrative.pendingDecisionId, null)
  assert.deepEqual(checkDecision(state, decisionIdFor(encounter.id)), { ok: false, reason: 'actions-incomplete' })
  state = takeInNarrative(state)
  assert.equal(state.narrative.pendingDecisionId, decisionIdFor(encounter.id))
})

test('F. call encounters: hearing the call before the call screen opens does not count, and the authored voicemail alternative does', () => {
  const callEncounter = seedWhere('mika', q => q[0] === 'MK-R3')
  let state = gameReducer(callEncounter, { type: 'TRIGGER_ENCOUNTER' })
  const completed = { kind: 'CALL_COMPLETED', app: 'calls', target: PHONE_TARGETS.incident('MK-R3') } as const
  assert.equal(phoneEvent(state, completed), state)
  state = openIncident(state)
  state = findEvidence(state)
  assert.equal(state.narrative.pendingDecisionId, null)
  // The authored scenario explicitly allows either answering or the voicemail.
  state = phoneEvent(state, { kind: 'MESSAGE_READ', app: 'calls', target: PHONE_TARGETS.voicemail('MK-R3') })
  assert.equal(state.narrative.pendingDecisionId, 'MK-R3-D1')
  assert.ok(state.narrative.presentedNarrative.includes('MK-R3:call-audio'))
})

// ---------------------------------------------------------------- G

test('G. refresh keeps completed actions, never exposes future decisions and never duplicates submissions', () => {
  const storage = memoryStorage()

  // Mid-investigation: progress survives, nothing is pending yet.
  let state = takeInNarrative(openIncident(gameReducer(startedWith('mika', 44), { type: 'TRIGGER_ENCOUNTER' })))
  state = gameReducer(state, { type: 'INSPECT_ARTIFACT', artifactId: currentEncounter(state)!.artifacts[0].id, now: T0 })
  saveGame(state, storage)
  let restored = loadGame(storage)
  assert.deepEqual(restored, state)
  assert.equal(restored.narrative.pendingDecisionId, null)

  // Finishing after the refresh unlocks the right decision, and an open sheet is restored as open.
  restored = openPending(findEvidence(restored))
  assert.equal(restored.phase, 'DECISION')
  saveGame(restored, storage)
  restored = loadGame(storage)
  assert.equal(restored.phase, 'DECISION')
  assert.equal(restored.narrative.pendingDecisionId, decisionIdFor(currentEncounter(restored)!.id))

  // Submitted once, refreshed twice: still one submission, and it cannot be repeated.
  const submitted = gameReducer(restored, { type: 'CHOOSE', choiceId: orderedChoices(restored)[0].id, now: T0 + 9000 })
  saveGame(submitted, storage)
  const again = loadGame(storage)
  saveGame(again, storage)
  const twice = loadGame(storage)
  assert.equal(twice.decisionHistory.length, 1)
  assert.equal(twice.narrative.submittedDecisionIds.length, 1)
  assert.equal(gameReducer({ ...twice, phase: 'DECISION' }, { type: 'CHOOSE', choiceId: orderedChoices(twice)[1].id, now: T0 + 10_000 }).decisionHistory.length, 1)
})

test('G. an edited save cannot expose a future decision or replay a submitted one', () => {
  const storage = memoryStorage()
  const ready = investigateFully(startedWith('mika', 44))
  const future = decisionIdFor(ready.encounterQueue[3])

  // Pending decision swapped for a future one, sheet left open.
  saveGame({ ...ready, phase: 'DECISION', narrative: { ...ready.narrative, pendingDecisionId: future } }, storage)
  let restored = loadGame(storage)
  assert.notEqual(restored.narrative.pendingDecisionId, future)
  assert.equal(restored.phase, 'INVESTIGATION')
  assert.equal(gameReducer(restored, { type: 'OPEN_DECISION', decisionId: future }), restored)
  assert.equal(restored.narrative.pendingDecisionId, ready.narrative.pendingDecisionId, 'the real decision is re-derived from completed actions')

  // A save that already submitted the current decision cannot submit it again.
  const current = ready.narrative.pendingDecisionId!
  saveGame({ ...ready, phase: 'DECISION', narrative: { ...ready.narrative, submittedDecisionIds: [current, current] } }, storage)
  restored = loadGame(storage)
  assert.deepEqual(restored.narrative.submittedDecisionIds, [current])
  assert.equal(restored.narrative.pendingDecisionId, null)
  assert.equal(restored.phase, 'INVESTIGATION')
  assert.equal(gameReducer({ ...restored, phase: 'DECISION' }, { type: 'CHOOSE', choiceId: orderedChoices(ready)[0].id, decisionId: current, now: T0 }).decisionHistory.length, 0)

  // Saves from before the narrative engine start fresh.
  assert.equal(loadGame({ getItem: () => JSON.stringify({ ...ready, saveVersion: SAVE_VERSION - 1 }) }).phase, 'MAIN_MENU')
  const { narrative: _dropped, ...withoutNarrative } = ready
  void _dropped
  assert.equal(loadGame({ getItem: () => JSON.stringify(withoutNarrative) }).phase, 'MAIN_MENU')
})

// ---------------------------------------------------------------- controller

test('every authored encounter has valid scenario definitions', () => {
  assert.deepEqual(validateNarrative(), [])
  assert.equal(ENCOUNTER_NARRATIVES.size, 16)
  for (const narrative of ENCOUNTER_NARRATIVES.values()) {
    assert.deepEqual(narrative.scenarios.map(s => s.id), [`${narrative.encounterId}-S1`, `${narrative.encounterId}-S2`])
    assert.equal(narrative.scenarios[0].decisionId, null)
    assert.equal(narrative.scenarios[1].decisionId, narrative.decision.id)
  }
})

test('encounters progress one at a time and future encounters stay locked', () => {
  let state = startedWith('rafa', 5)
  const [first, second] = state.encounterQueue
  assert.equal(state.narrative.activeEncounterId, first)
  assert.equal(state.narrative.encounterLifecycle[first], 'AVAILABLE')
  assert.ok(state.encounterQueue.slice(1).every(id => state.narrative.encounterLifecycle[id] === 'LOCKED'))
  assert.equal(incidentDue(state), true)

  state = openPending(investigateFully(state))
  state = gameReducer(state, { type: 'CHOOSE', choiceId: orderedChoices(state)[0].id, now: T0 })
  assert.equal(state.narrative.encounterLifecycle[first], 'FEEDBACK')
  assert.equal(gameReducer(state, { type: 'TRIGGER_ENCOUNTER' }), state, 'the next incident waits for feedback to finish')
  state = run(state, { type: 'CONTINUE' }, { type: 'NEXT_ENCOUNTER', now: T0 })
  assert.equal(state.narrative.encounterLifecycle[first], 'RESOLVED')
  assert.equal(state.narrative.activeEncounterId, second)
  assert.equal(state.narrative.encounterLifecycle[second], 'AVAILABLE')
  assert.equal(pendingDecision(state), undefined)
})

test('the shuffled order never overrides authored encounter dependencies', () => {
  const requires = (id: string) => ({ C: ['A'], D: ['C'] } as Record<string, string[]>)[id] ?? []
  assert.deepEqual(orderByDependencies(['D', 'C', 'B', 'A'], requires), ['B', 'A', 'C', 'D'])
  assert.deepEqual(orderByDependencies(['B', 'A', 'C'], requires), ['B', 'A', 'C'], 'already valid orders are kept')
  assert.deepEqual(orderByDependencies(['A', 'B'], () => []), ['A', 'B'])
})

test('unrelated phone events return the same state object', () => {
  const state = openIncident(gameReducer(startedWith('mika', 9), { type: 'TRIGGER_ENCOUNTER' }))
  const unrelated = [
    { kind: 'CONVERSATION_OPENED', app: 'messages', target: PHONE_TARGETS.ambient('messages', 2) },
    { kind: 'ATTACHMENT_OPENED', app: 'email', target: PHONE_TARGETS.ambient('email', 1) },
    { kind: 'INFORMATION_DISCOVERED', app: 'browser', target: PHONE_TARGETS.ambient('browser', 'nb-directory') },
    { kind: 'ARTIFACT_VIEWED', app: 'messages', target: PHONE_TARGETS.artifact('RF-A1-ART-01') },
  ] as const
  for (const event of unrelated) assert.equal(phoneEvent(state, event), state, `${event.kind} ${event.target}`)
})
