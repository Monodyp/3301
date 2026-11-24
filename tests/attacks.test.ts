// Scripted cyberattack progression: every incident is an attack, in encounter
// order, whatever the player decides. Decisions change outcomes, not whether
// the next attack comes.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ATTACK_DEFINITIONS, attackEvents, attackIdFor, attackNotificationDue } from '../src/game/attacks.ts'
import { CHARACTERS } from '../src/game/content/index.ts'
import { currentEncounter, gameReducer, initialGameState, orderedChoices } from '../src/game/engine.ts'
import { loadGame, saveGame } from '../src/game/storage.ts'
import type { GameState } from '../src/game/types.ts'
import { T0, investigateFully, memoryStorage, openPending, run } from './support/play.ts'

function started(seed = 1234, characterId = 'mika'): GameState {
  return run(initialGameState(), { type: 'START_RUN', seed, now: T0, characterId }, { type: 'ENTER_PHONE' })
}

const deliver = (s: GameState) => gameReducer(s, { type: 'TRIGGER_ENCOUNTER' })
const notify = (s: GameState, attackId: string) => gameReducer(s, { type: 'ATTACK_NOTIFIED', attackId })
const nextEncounter = (s: GameState) => run(s, { type: 'CONTINUE' }, { type: 'NEXT_ENCOUNTER', now: T0 })

// From the idle phone or an arrived incident to the feedback card, choosing right or wrong.
function decide(state: GameState, correct: boolean): GameState {
  const s = openPending(investigateFully(state))
  const choice = orderedChoices(s).find(c => c.isCorrect === correct)!
  return gameReducer(s, { type: 'CHOOSE', choiceId: choice.id, now: T0 + 5000 })
}

const view = (s: GameState) => attackEvents(s).map(a => ({ id: a.id, ordinal: a.ordinal, tier: a.tierLabel, title: a.title, resolved: a.resolved }))

// Plays a whole run with the given answer pattern, showing every attack notification when due.
function playRun(pattern: boolean[], seed = 1234, characterId = 'mika') {
  let s = started(seed, characterId)
  const seen: { id: string; ordinal: number; tier: string; title: string; message: string }[] = []
  for (const correct of pattern) {
    s = deliver(s) // the next incident arrives
    const due = attackNotificationDue(s)
    if (due) { seen.push({ id: due.id, ordinal: due.ordinal, tier: due.tierLabel, title: due.title, message: due.message }); s = notify(s, due.id) }
    assert.equal(attackNotificationDue(s), undefined, 'one notification per attack')
    s = nextEncounter(decide(s, correct))
  }
  return { state: s, seen }
}

test('1. attack 1 occurs at its own trigger, with no earlier decision at all', () => {
  const idle = started()
  assert.deepEqual(idle.attacks.triggered, [], 'nothing before the first incident arrives')
  const s = deliver(idle)
  const [first] = attackEvents(s)
  assert.equal(first.id, attackIdFor(currentEncounter(s)!.id))
  assert.equal(first.ordinal, 1)
  assert.equal(first.tierLabel, 'Anomaly')
  assert.equal(first.title, currentEncounter(s)!.trigger.title, 'the incident’s authored notification')
  assert.equal(s.decisionHistory.length, 0)
  assert.equal(attackNotificationDue(s)?.id, first.id)
})

test('2–3. resolving attack 1 triggers attack 2, whether the decision was correct or not', () => {
  for (const correct of [true, false]) {
    let s = deliver(started())
    s = notify(s, attackEvents(s)[0].id)
    s = decide(s, correct)
    assert.equal(s.decisionHistory[0].correct, correct)
    assert.deepEqual(s.attacks.resolved, [s.attacks.triggered[0]], 'submitting the decision resolves it')
    assert.equal(attackEvents(s).length, 1, 'attack 2 waits until the feedback is done')
    s = deliver(nextEncounter(s))
    const second = attackEvents(s)[1]
    assert.equal(second.ordinal, 2, `${correct ? 'correct' : 'incorrect'} decision`)
    assert.equal(second.tierLabel, 'Intrusion')
    assert.equal(second.encounterId, currentEncounter(s)!.id)
    assert.equal(attackNotificationDue(s)?.id, second.id)
  }
})

test('4–5. correct and incorrect playthroughs experience the same attack sequence', () => {
  for (const character of CHARACTERS) {
    const right = playRun(Array(8).fill(true), 1234, character.id)
    const wrong = playRun(Array(8).fill(false), 1234, character.id)
    const mixed = playRun([true, false, false, true, false, true, true, false], 1234, character.id)
    assert.equal(right.seen.length, 8, `${character.id}: one attack per incident`)
    assert.deepEqual(wrong.seen, right.seen, `${character.id}: all-wrong sees the same attacks`)
    assert.deepEqual(mixed.seen, right.seen, `${character.id}: a mixed run too`)
    assert.deepEqual(right.seen.map(a => a.tier), ['Anomaly', 'Intrusion', 'Compromise', 'Escalation', 'Escalation', 'Escalation', 'Escalation', 'Escalation'])
    assert.deepEqual(right.seen.map(a => a.ordinal), [1, 2, 3, 4, 5, 6, 7, 8])
    assert.deepEqual(right.seen.map(a => a.id), right.state.encounterQueue.map(attackIdFor), 'in encounter order')
    // Outcomes still differ: decisions are evaluated normally.
    assert.equal(right.state.consequences.length, 0)
    assert.ok(wrong.state.consequences.length > 0)
    assert.notEqual(wrong.state.playerScore, right.state.playerScore)
    assert.deepEqual(view(wrong.state).map(a => a.resolved), Array(8).fill(true))
  }
})

test('5. attack 3 follows attack 2 after resolution, for any decision outcome', () => {
  for (const [a, b] of [[true, true], [false, false], [true, false], [false, true]]) {
    let s = deliver(started(77))
    s = deliver(nextEncounter(decide(s, a)))
    s = deliver(nextEncounter(decide(s, b)))
    assert.deepEqual(attackEvents(s).map(e => e.tierLabel), ['Anomaly', 'Intrusion', 'Compromise'], `${a}/${b}`)
  }
})

test('6. an attack never triggers or notifies twice, across rerenders and refreshes', () => {
  const storage = memoryStorage()
  let s = deliver(started())
  const first = attackEvents(s)[0]
  s = notify(s, first.id)
  assert.equal(notify(s, first.id), s, 'a second report changes nothing')
  assert.equal(attackNotificationDue(s), undefined)

  saveGame(s, storage)
  let restored = loadGame(storage)
  assert.deepEqual(restored.attacks, s.attacks)
  assert.equal(attackNotificationDue(restored), undefined, 'not shown again after refresh')
  assert.equal(deliver(restored), restored, 'cannot be re-triggered')

  // Refresh after the next incident arrived but before its notification showed: shown exactly once.
  restored = deliver(nextEncounter(decide(restored, true)))
  saveGame(restored, storage)
  const reloaded = loadGame(storage)
  const due = attackNotificationDue(reloaded)!
  assert.equal(due.ordinal, 2)
  const shown = notify(reloaded, due.id)
  saveGame(shown, storage)
  assert.equal(attackNotificationDue(loadGame(storage)), undefined)
  assert.deepEqual(loadGame(storage).attacks.triggered, shown.attacks.triggered)
})

test('6b. a save from before scripted attacks does not replay earlier attacks', () => {
  let s = deliver(started())
  s = deliver(nextEncounter(decide(s, true)))
  const { attacks: _dropped, ...old } = s
  void _dropped
  const restored = loadGame({ getItem: () => JSON.stringify({ ...old, notifiedAttackIds: [] }) })
  assert.deepEqual(restored.attacks.triggered, s.attacks.triggered)
  assert.equal(attackNotificationDue(restored)?.ordinal, 2, 'only the current incident is still to be shown')
})

test('7. the next attack cannot occur before the preceding one is resolved', () => {
  let s = deliver(started())
  const [first, second] = s.encounterQueue
  assert.equal(s.narrative.encounterLifecycle[second], 'LOCKED')
  // Force the next incident in with the developer jump: attack 1 is unresolved, so attack 2 must not start.
  s = deliver(gameReducer(s, { type: 'DEV_JUMP_TO_ENCOUNTER', index: 1 }))
  assert.equal(s.narrative.encounterLifecycle[second], 'DELIVERED')
  assert.deepEqual(s.attacks.triggered, [attackIdFor(first)])
  // Notifications follow order too: a later attack cannot be marked shown first.
  assert.equal(notify(s, attackIdFor(second)), s)
  // Nothing about opening apps or browsing triggers an attack.
  const browsing = gameReducer(deliver(started()), { type: 'REPORT_PHONE_EVENT', event: { kind: 'CONVERSATION_OPENED', app: 'messages', target: 'ambient:messages:1' }, now: T0 })
  assert.equal(attackEvents(browsing).length, 1)
})

test('attack progression is independent of decision results and consequences', () => {
  // Every attack is defined by narrative events only.
  for (const attack of ATTACK_DEFINITIONS.values()) {
    assert.equal(attack.trigger.kind, 'incident-delivered')
    assert.equal(attack.resolution.kind, 'decision-submitted')
  }
  // Wiping the run's consequences and scores changes nothing about the attacks.
  const { state } = playRun([false, false, false])
  const scrubbed = { ...state, consequences: [], decisionHistory: [], playerScore: 0 }
  assert.deepEqual(view(gameReducer(scrubbed, { type: 'COMPLETE_SECURITY_TASK', taskId: 'x' })), view(state))
  // Marking a notification shown touches nothing else.
  const arrived = deliver(started())
  const marked = notify(arrived, attackEvents(arrived)[0].id)
  assert.deepEqual({ ...marked, attacks: arrived.attacks }, arrived)
})

test('notifications wait while a decision or feedback is on screen', () => {
  let s = openPending(investigateFully(started()))
  assert.equal(s.phase, 'DECISION')
  assert.equal(attackNotificationDue(s), undefined, 'not over the decision sheet')
  s = gameReducer(s, { type: 'BACK_TO_INVESTIGATION' })
  assert.equal(attackNotificationDue(s)?.ordinal, 1)
  s = gameReducer(openPending(s), { type: 'CHOOSE', choiceId: orderedChoices(openPending(s))[0].id, now: T0 })
  assert.equal(s.phase, 'CONSEQUENCE')
  assert.equal(attackNotificationDue(s), undefined, 'not over the feedback card')
})

