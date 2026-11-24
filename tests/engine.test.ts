// Engine tests (Stage 4, section 14). Run with: npm test
// Uses Node's built-in test runner; no extra packages needed (Node 22.18+).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { CHARACTERS, validateContent } from '../src/game/content/index.ts'
import {
  ENCOUNTERS_PER_RUN,
  canDispatch,
  currentEncounter,
  gameReducer,
  initialGameState,
  nextHintDueAt,
  orderedChoices,
  type GameAction,
} from '../src/game/engine.ts'
import { createRng, shuffle } from '../src/game/random.ts'
import { clueBonus, horrorStageFor, scoreDecision, survivalRating, timeBonus } from '../src/game/scoring.ts'
import { loadGame, saveGame } from '../src/game/storage.ts'
import { ARCHETYPES, type GameState } from '../src/game/types.ts'
import { EDUCATIONAL_DEBRIEF, feedbackForDecision, formatCompletionTime } from '../src/game/educational.ts'

const T0 = 1_700_000_000_000

function run(state: GameState, ...actions: GameAction[]): GameState {
  return actions.reduce(gameReducer, state)
}

function started(seed = 42): GameState {
  return run(initialGameState(), { type: 'START_RUN', seed, now: T0 }, { type: 'ENTER_PHONE' })
}

// Plays the current encounter: inspect everything, decide after `seconds`.
function playEncounter(state: GameState, pickCorrect: boolean, seconds = 10): GameState {
  const startAt = T0 + state.currentEncounterIndex * 60_000
  let s = run(state, { type: 'TRIGGER_ENCOUNTER' }, { type: 'BEGIN_INVESTIGATION', now: startAt })
  for (const a of currentEncounter(s)!.artifacts) s = gameReducer(s, { type: 'INSPECT_ARTIFACT', artifactId: a.id, now: T0 })
  s = gameReducer(s, { type: 'OPEN_DECISION' })
  const choice = orderedChoices(s).find(c => c.isCorrect === pickCorrect)!
  return run(s, { type: 'CHOOSE', choiceId: choice.id, now: startAt + seconds * 1000 }, { type: 'CONTINUE' })
}

function playWholeRun(state: GameState, correctPattern: boolean[]): GameState {
  let s = state
  for (const correct of correctPattern) {
    s = playEncounter(s, correct)
    s = gameReducer(s, { type: 'NEXT_ENCOUNTER', now: T0 + 50000 })
  }
  return s
}

test('content: every character passes the integrity checks', () => {
  assert.deepEqual(validateContent(), [])
})

test('Mika and Rafa each have complete, sequential encounter runs', () => {
  for (const characterId of ['mika', 'rafa']) {
    const s = run(initialGameState(), { type: 'START_RUN', seed: 77, now: T0, characterId }, { type: 'ENTER_PHONE' })
    const character = CHARACTERS.find(c => c.id === characterId)!
    assert.equal(s.characterId, characterId)
    assert.equal(s.encounterQueue.length, 8)
    assert.equal(new Set(s.encounterQueue).size, 8)
    const archetypes = s.encounterQueue.map(id => character.encounters.find(encounter => encounter.id === id)!.archetype)
    assert.equal(archetypes.filter(archetype => archetype.startsWith('A')).length, 3)
    assert.equal(archetypes.filter(archetype => archetype.startsWith('R')).length, 3)
    assert.equal(archetypes.filter(archetype => archetype.startsWith('O')).length, 2)
    const completed = playWholeRun(s, Array(8).fill(true))
    assert.equal(completed.phase, 'RESULTS')
    assert.equal(completed.completedEncounters.length, 8)
  }
})

test('all authored encounters have 2-3 contextual choices', () => {
  for (const character of CHARACTERS) {
    for (const encounter of character.encounters) {
      assert.ok(encounter.choices.length >= 2 && encounter.choices.length <= 3)
      assert.equal(encounter.choices.filter(choice => choice.isCorrect).length, 1)
    }
  }
})

test('feedback matches the submitted choice and encounter category', () => {
  let s = run(started(), { type: 'TRIGGER_ENCOUNTER' }, { type: 'BEGIN_INVESTIGATION', now: T0 }, { type: 'OPEN_DECISION' })
  const encounter = currentEncounter(s)!
  const correct = orderedChoices(s).find(choice => choice.isCorrect)!
  s = gameReducer(s, { type: 'CHOOSE', choiceId: correct.id, now: T0 + 5000 })
  const decision = s.decisionHistory[s.decisionHistory.length - 1]
  const feedback = feedbackForDecision(encounter, decision)
  assert.equal(feedback.result, 'Correct')
  assert.equal(feedback.category, encounter.category)
  assert.equal(feedback.principle, encounter.feedback.principle)
  assert.equal(feedback.recommendedAction, encounter.feedback.recommendedAction)
  assert.equal(feedback.saferChoice, undefined)
})

test('incorrect feedback explains the risky selected response and a safer alternative', () => {
  let s = run(started(), { type: 'TRIGGER_ENCOUNTER' }, { type: 'BEGIN_INVESTIGATION', now: T0 }, { type: 'OPEN_DECISION' })
  const encounter = currentEncounter(s)!
  const incorrect = orderedChoices(s).find(choice => !choice.isCorrect)!
  s = gameReducer(s, { type: 'CHOOSE', choiceId: incorrect.id, now: T0 + 5000 })
  const decision = s.decisionHistory[s.decisionHistory.length - 1]
  const feedback = feedbackForDecision(encounter, decision)
  assert.equal(feedback.result, 'Incorrect')
  assert.equal(feedback.selectedOutcome, incorrect.outcome)
  assert.ok(feedback.saferChoice)
  assert.ok(feedback.recommendedAction.length > 0)
})

test('completion time and category debrief use actual run state', () => {
  assert.equal(formatCompletionTime(T0, T0 + 125_000), '2:05')
  assert.equal(formatCompletionTime(null, null), '0:00')
  assert.equal(EDUCATIONAL_DEBRIEF.awareness.topic, 'Cybersecurity awareness')
  assert.equal(EDUCATIONAL_DEBRIEF.responsibility.topic, 'Responsible account and incident response')
  assert.equal(EDUCATIONAL_DEBRIEF.opportunity.topic, 'Cybersecurity opportunity and professional engagement awareness')
})

test('call and advertisement metadata remains attached to the authored encounter', () => {
  const mika = CHARACTERS.find(character => character.id === 'mika')!
  const rafa = CHARACTERS.find(character => character.id === 'rafa')!
  assert.ok(mika.encounters.some(encounter => encounter.advertisement?.encounterId === encounter.id))
  assert.ok(rafa.encounters.some(encounter => encounter.advertisement?.encounterId === encounter.id))
  assert.ok(mika.encounters.some(encounter => encounter.incomingCall?.encounterId === encounter.id))
  assert.ok(rafa.encounters.some(encounter => encounter.incomingCall?.encounterId === encounter.id))
})

test('optional security tasks are recorded once and survive the run', () => {
  let s = started()
  s = gameReducer(s, { type: 'COMPLETE_SECURITY_TASK', taskId: 'verify-sender' })
  assert.deepEqual(s.completedSecurityTasks, ['verify-sender'])
  s = gameReducer(s, { type: 'COMPLETE_SECURITY_TASK', taskId: 'verify-sender' })
  assert.deepEqual(s.completedSecurityTasks, ['verify-sender'])
})

test('shuffle is repeatable with the same seed and keeps every item', () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8]
  assert.deepEqual(shuffle(items, createRng(7)), shuffle(items, createRng(7)))
  assert.deepEqual([...shuffle(items, createRng(7))].sort(), items)
  assert.deepEqual(items, [1, 2, 3, 4, 5, 6, 7, 8], 'input is not mutated')
})

test('every run has exactly 8 encounters, one of each archetype', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const s = started(seed)
    assert.equal(s.encounterQueue.length, ENCOUNTERS_PER_RUN)
    const character = CHARACTERS.find(c => c.id === s.characterId)!
    const archetypes = s.encounterQueue.map(id => character.encounters.find(e => e.id === id)!.archetype).sort()
    assert.deepEqual(archetypes, [...ARCHETYPES].sort())
  }
})

test('encounter order and choice order vary between runs', () => {
  const orders = new Set<string>()
  const firstChoice = new Set<string>()
  for (let seed = 1; seed <= 50; seed++) {
    const s = run(initialGameState(), { type: 'START_RUN', seed, now: T0, characterId: 'mika' }, { type: 'ENTER_PHONE' })
    orders.add(s.encounterQueue.join())
    firstChoice.add(s.choiceOrder['MK-A1'][0])
  }
  assert.ok(orders.size > 40, `only ${orders.size} distinct encounter orders in 50 runs`)
  assert.ok(firstChoice.size >= 3, 'the correct answer is not always in the same position')
})

test('same seed restores the same encounter order and Play Again creates a new session', () => {
  const first = run(initialGameState(), { type: 'START_RUN', seed: 1234, now: T0, characterId: 'mika' }, { type: 'ENTER_PHONE' })
  const repeat = run(initialGameState(), { type: 'START_RUN', seed: 1234, now: T0, characterId: 'mika' }, { type: 'ENTER_PHONE' })
  assert.deepEqual(repeat.encounterQueue, first.encounterQueue)

  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  }
  saveGame(first, storage)
  assert.deepEqual(loadGame(storage).encounterQueue, first.encounterQueue)

  const completed = { ...loadGame(storage), phase: 'RESULTS' as const, completedEncounters: loadGame(storage).encounterQueue }
  const next = gameReducer(completed, { type: 'PLAY_AGAIN', seed: 5678, now: T0 + 1000 })
  assert.equal(next.seed, 5678)
  assert.notDeepEqual(next.encounterQueue, first.encounterQueue)
  assert.equal(next.completedEncounters.length, 0)
  assert.equal(next.playerScore, 0)
  assert.equal(next.inspectedArtifacts.length, 0)
  assert.equal(next.accountSecurity, 100)
})

test('illegal transitions are ignored', () => {
  const menu = initialGameState()
  assert.equal(gameReducer(menu, { type: 'CHOOSE', choiceId: 'MK-A1-c2', now: T0 }), menu)

  const idle = started()
  assert.equal(gameReducer(idle, { type: 'OPEN_DECISION' }), idle, 'cannot decide before investigating')
  assert.equal(gameReducer(idle, { type: 'NEXT_ENCOUNTER', now: T0 }), idle)
  assert.equal(canDispatch(idle, 'TRIGGER_ENCOUNTER'), true)
  assert.equal(canDispatch(idle, 'CHOOSE'), false)
})

test('an encounter cannot be completed twice', () => {
  let s = run(started(), { type: 'TRIGGER_ENCOUNTER' }, { type: 'BEGIN_INVESTIGATION', now: T0 }, { type: 'OPEN_DECISION' })
  const [first, second] = orderedChoices(s)
  s = gameReducer(s, { type: 'CHOOSE', choiceId: first.id, now: T0 + 5000 })
  const again = gameReducer(s, { type: 'CHOOSE', choiceId: second.id, now: T0 + 6000 })
  assert.equal(again, s)
  assert.equal(s.decisionHistory.length, 1)
})

test('results only appear after all 8 encounters', () => {
  let s = started()
  for (let i = 0; i < 7; i++) {
    s = gameReducer(playEncounter(s, true), { type: 'NEXT_ENCOUNTER', now: T0 + 10000 })
    assert.equal(s.phase, 'PHONE_IDLE')
  }
  s = gameReducer(playEncounter(s, true), { type: 'NEXT_ENCOUNTER', now: T0 + 999_999 })
  assert.equal(s.phase, 'RESULTS')
  assert.equal(s.runFinishedAt, T0 + 999_999)
})

test('a perfect fast run scores 800 base plus full bonuses', () => {
  const s = playWholeRun(started(), Array(8).fill(true))
  assert.equal(s.decisionHistory.filter(d => d.correct).length, 8)
  assert.equal(s.playerScore, 8 * (100 + 25 + 10))
  assert.equal(survivalRating(8), 'FULLY SECURED')
})

test('wrong answers never stop the run, and apply soft consequences', () => {
  const s = playWholeRun(started(3), Array(8).fill(false))
  assert.equal(s.phase, 'RESULTS')
  assert.equal(s.completedEncounters.length, 8)
  assert.ok(s.consequences.length > 0)
  assert.ok(s.playerScore <= 8 * 10, 'only clue bonuses can be earned when every answer is wrong')
  assert.equal(survivalRating(0), 'BLACKED OUT')
})

test('scoring: time bonus, clue bonus and hint penalty', () => {
  assert.equal(timeBonus(10, true), 25)
  assert.equal(timeBonus(30, true), 13)
  assert.equal(timeBonus(60, true), 0)
  assert.equal(timeBonus(5, false), 0, 'no time bonus for a wrong answer')
  assert.equal(clueBonus(3, 3, 0), 10)
  assert.equal(clueBonus(0, 3, 0), 0)
  assert.equal(clueBonus(3, 3, 2), 4)
  assert.equal(clueBonus(1, 3, 3), 0, 'never negative')
  assert.deepEqual(scoreDecision({ correct: true, secondsTaken: 10, inspectedKeyEvidence: 3, totalKeyEvidence: 3, hintsUsed: 0 }), {
    base: 100,
    timeBonus: 25,
    clueBonus: 10,
    total: 135,
  })
})

test('survival ratings match GDD 9.3', () => {
  const expected = ['BLACKED OUT', 'BLACKED OUT', 'CRITICAL', 'CRITICAL', 'PARTIALLY COMPROMISED', 'PARTIALLY COMPROMISED', 'MOSTLY SECURED', 'MOSTLY SECURED', 'FULLY SECURED']
  expected.forEach((rating, correct) => assert.equal(survivalRating(correct), rating))
})

test('artifacts from another encounter cannot be inspected', () => {
  const s = run(started(), { type: 'TRIGGER_ENCOUNTER' }, { type: 'BEGIN_INVESTIGATION', now: T0 })
  const other = CHARACTERS[0].encounters.find(e => e.id !== currentEncounter(s)!.id)!
  assert.equal(gameReducer(s, { type: 'INSPECT_ARTIFACT', artifactId: other.artifacts[0].id, now: T0 }), s)
})

test('hints are capped and reduce the clue bonus', () => {
  let s = run(started(), { type: 'TRIGGER_ENCOUNTER' }, { type: 'BEGIN_INVESTIGATION', now: T0 })
  const encounter = currentEncounter(s)!
  for (let i = 0; i < 10; i++) s = gameReducer(s, { type: 'USE_HINT', now: T0 })
  assert.equal(s.hintsUsed[encounter.id], encounter.hints.length)
  for (const a of encounter.artifacts) s = gameReducer(s, { type: 'INSPECT_ARTIFACT', artifactId: a.id, now: T0 })
  s = gameReducer(s, { type: 'OPEN_DECISION' })
  const correct = orderedChoices(s).find(c => c.isCorrect)!
  s = gameReducer(s, { type: 'CHOOSE', choiceId: correct.id, now: T0 + 10_000 })
  assert.equal(s.decisionHistory[0].score.clueBonus, 10 - 3 * encounter.hints.length)
})

test('save and restore: a refresh gives back the exact same state', () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  }
  let s = started(11)
  s = playEncounter(s, true)
  s = run(s, { type: 'NEXT_ENCOUNTER', now: T0 + 20000 }, { type: 'TRIGGER_ENCOUNTER' }, { type: 'BEGIN_INVESTIGATION', now: T0 })
  saveGame(s, storage)
  assert.deepEqual(loadGame(storage), s)
})

test('refresh restores feedback and results phases without restarting', () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  }

  let s = run(started(19), { type: 'TRIGGER_ENCOUNTER' }, { type: 'BEGIN_INVESTIGATION', now: T0 }, { type: 'OPEN_DECISION' })
  const correct = orderedChoices(s).find(choice => choice.isCorrect)!
  s = gameReducer(s, { type: 'CHOOSE', choiceId: correct.id, now: T0 + 5000 })
  assert.equal(s.phase, 'CONSEQUENCE')
  saveGame(s, storage)
  const restoredFeedback = loadGame(storage)
  assert.equal(restoredFeedback.phase, 'CONSEQUENCE')
  assert.equal(restoredFeedback.decisionHistory.length, 1)
  assert.equal(restoredFeedback.decisionHistory[0].correct, true)

  let results = playWholeRun(started(19), Array(8).fill(true))
  saveGame(results, storage)
  const restoredResults = loadGame(storage)
  assert.equal(restoredResults.phase, 'RESULTS')
  assert.equal(restoredResults.completedEncounters.length, 8)
})

test('a broken or outdated save starts fresh instead of crashing', () => {
  const bad = (raw: string) => loadGame({ getItem: () => raw })
  assert.equal(bad('not json').phase, 'MAIN_MENU')
  assert.equal(bad(JSON.stringify({ saveVersion: 0, phase: 'DECISION' })).phase, 'MAIN_MENU')
  assert.equal(bad(JSON.stringify({ ...started(), characterId: 'nobody' })).phase, 'MAIN_MENU')
})

test('play again starts a clean run that inherits nothing', () => {
  let s = playWholeRun(started(5), [true, false, true, false, true, false, true, false])
  s = run(s, { type: 'PLAY_AGAIN', seed: 99, now: T0 + 600_000 })
  assert.equal(s.phase, 'CHARACTER_ASSIGNMENT')
  assert.equal(s.seed, 99)
  assert.deepEqual(s.decisionHistory, [])
  assert.deepEqual(s.completedEncounters, [])
  assert.deepEqual(s.inspectedArtifacts, [])
  assert.equal(s.playerScore, 0)
  assert.equal(s.accountSecurity, 100)
})

test('horror rises with progress', () => {
  assert.equal(horrorStageFor(0, 0), 'NORMAL')
  assert.equal(horrorStageFor(1, 0), 'UNSETTLED')
  assert.equal(horrorStageFor(4, 0), 'COMPROMISED')
  assert.equal(horrorStageFor(2, 2), 'COMPROMISED', 'mistakes bring it on earlier')
  assert.equal(horrorStageFor(8, 0), 'BLACKOUT')
})

test('hint timer: one hint per 10 s of being stuck, restarting on progress', () => {
  let s = run(started(), { type: 'TRIGGER_ENCOUNTER' })
  assert.equal(nextHintDueAt(s), null, 'no hints before investigating')
  s = gameReducer(s, { type: 'BEGIN_INVESTIGATION', now: T0 })
  assert.equal(nextHintDueAt(s), T0 + 10_000)

  const [first, ...rest] = currentEncounter(s)!.artifacts
  s = gameReducer(s, { type: 'INSPECT_ARTIFACT', artifactId: first.id, now: T0 + 4_000 })
  assert.equal(nextHintDueAt(s), T0 + 14_000, 'finding evidence restarts the clock')

  s = gameReducer(s, { type: 'USE_HINT', now: T0 + 14_000 })
  assert.equal(nextHintDueAt(s), T0 + 24_000, 'next hint 10 s after the last one')

  s = gameReducer(s, { type: 'OPEN_DECISION' })
  assert.notEqual(nextHintDueAt(s), null, 'hints keep coming on the decision sheet')

  for (const a of rest) s = gameReducer(s, { type: 'INSPECT_ARTIFACT', artifactId: a.id, now: T0 + 25_000 })
  assert.equal(nextHintDueAt(s), null, 'no hints once all key evidence is found')
})

test('hint timer stops when hints run out or the encounter ends', () => {
  let s = run(started(), { type: 'TRIGGER_ENCOUNTER' }, { type: 'BEGIN_INVESTIGATION', now: T0 })
  for (let i = 0; i < 3; i++) s = gameReducer(s, { type: 'USE_HINT', now: T0 + i })
  assert.equal(nextHintDueAt(s), null)
  s = gameReducer(s, { type: 'OPEN_DECISION' })
  s = gameReducer(s, { type: 'CHOOSE', choiceId: orderedChoices(s)[0].id, now: T0 + 30_000 })
  assert.equal(nextHintDueAt(s), null)
})

test('horror follows progress through a real run', () => {
  let s = started(4)
  const stages: string[] = []
  for (let i = 0; i < 8; i++) {
    s = gameReducer(playEncounter(s, true), { type: 'NEXT_ENCOUNTER', now: T0 })
    stages.push(horrorStageFor(s.completedEncounters.length, 0))
  }
  assert.deepEqual(stages, ['UNSETTLED', 'UNSETTLED', 'UNSETTLED', 'COMPROMISED', 'COMPROMISED', 'COMPROMISED', 'COMPROMISED', 'BLACKOUT'])
})
