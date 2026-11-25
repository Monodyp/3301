// Automatic clue discovery: a clue whose content stays on screen for
// CLUE_DWELL_MS without a break is discovered by the engine.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { CHARACTERS } from '../src/game/content/index.ts'
import { clueSource } from '../src/game/content/scenarios.ts'
import { currentEncounter, gameReducer, initialGameState } from '../src/game/engine.ts'
import { CLUE_DWELL_MS, nextClueDueAt } from '../src/game/narrative.ts'
import { loadGame, saveGame } from '../src/game/storage.ts'
import type { GameState } from '../src/game/types.ts'
import { T0, memoryStorage, openIncident, run, takeInNarrative } from './support/play.ts'

const visible = (artifactId: string, now: number) => ({ type: 'CLUE_VISIBLE', artifactId, now }) as const
const hidden = (artifactId: string, now: number) => ({ type: 'CLUE_HIDDEN', artifactId, now }) as const
const tick = (now: number) => ({ type: 'CLUE_TICK', now }) as const

function started(characterId = 'mika', seed = 1234): GameState {
  return run(initialGameState(), { type: 'START_RUN', seed, now: T0, characterId }, { type: 'ENTER_PHONE' })
}

// Investigating the first encounter, narrative already read.
function investigating(characterId = 'mika', seed = 1234): GameState {
  return takeInNarrative(openIncident(gameReducer(started(characterId, seed), { type: 'TRIGGER_ENCOUNTER' })))
}

const keyClues = (state: GameState) => currentEncounter(state)!.artifacts.filter(a => a.isKeyEvidence)

// A seed whose first encounter has two clues in the same app, and one with clues in two apps.
function withSameAppClues(): GameState {
  for (let seed = 1; seed < 500; seed++) {
    const state = investigating('mika', seed)
    const apps = keyClues(state).map(a => a.app)
    if (new Set(apps).size < apps.length && new Set(apps).size > 1) return state
  }
  throw new Error('no seed')
}

test('1. a clue coming on screen starts its discovery timer', () => {
  const state = investigating()
  const clue = keyClues(state)[0]
  const viewing = gameReducer(state, visible(clue.id, T0))
  assert.deepEqual(viewing.clueViewing, { [clue.id]: T0 })
  assert.equal(nextClueDueAt(viewing), T0 + CLUE_DWELL_MS + 1)
  assert.equal(viewing.inspectedArtifacts.includes(clue.id), false)
  assert.equal(gameReducer(viewing, visible(clue.id, T0 + 1000)), viewing, 'a second report does not restart the timer')
})

test('2. staying on the clue for more than three seconds discovers it', () => {
  const state = investigating()
  const clue = keyClues(state)[0]
  let s = gameReducer(state, visible(clue.id, T0))
  s = gameReducer(s, tick(T0 + CLUE_DWELL_MS))
  assert.equal(s.inspectedArtifacts.includes(clue.id), false, 'not before the time is up')
  s = gameReducer(s, tick(T0 + CLUE_DWELL_MS + 1))
  assert.deepEqual(s.inspectedArtifacts, [clue.id])
  assert.deepEqual(s.clueViewing, {})
})

test('3. leaving before three seconds does not discover it', () => {
  const clue = keyClues(investigating())[0]
  const s = run(investigating(), visible(clue.id, T0), hidden(clue.id, T0 + 2000), tick(T0 + 10_000))
  assert.deepEqual(s.inspectedArtifacts, [])
  assert.deepEqual(s.clueViewing, {})
})

test('4. switching to another app cancels the pending discovery; the new app starts its own', () => {
  const state = withSameAppClues()
  const clues = keyClues(state)
  const first = clues[0]
  const other = clues.find(c => c.app !== first.app)!
  // Viewing `first`, then the player switches apps at 1.5 s (the clue unmounts).
  let s = run(state, visible(first.id, T0), hidden(first.id, T0 + 1500), visible(other.id, T0 + 1500))
  s = gameReducer(s, tick(T0 + CLUE_DWELL_MS + 500))
  assert.equal(s.inspectedArtifacts.length, 0, 'neither clue has had three continuous seconds')
  s = gameReducer(s, tick(T0 + 1500 + CLUE_DWELL_MS + 1))
  assert.deepEqual(s.inspectedArtifacts, [other.id])
  // Coming back to the first clue starts again from zero.
  s = run(s, visible(first.id, T0 + 6000), tick(T0 + 8000))
  assert.equal(s.inspectedArtifacts.includes(first.id), false)
  s = gameReducer(s, tick(T0 + 6000 + CLUE_DWELL_MS + 1))
  assert.ok(s.inspectedArtifacts.includes(first.id))
})

test('5. time with the page in the background does not count', () => {
  const clue = keyClues(investigating())[0]
  let s = run(investigating(), visible(clue.id, T0), { type: 'CLUES_HIDDEN', now: T0 + 1000 })
  assert.deepEqual(s.clueViewing, {})
  s = gameReducer(s, tick(T0 + 60_000))
  assert.deepEqual(s.inspectedArtifacts, [], 'a minute in the background discovers nothing')
  s = run(s, visible(clue.id, T0 + 60_000), tick(T0 + 61_000))
  assert.deepEqual(s.inspectedArtifacts, [])
  s = gameReducer(s, tick(T0 + 60_000 + CLUE_DWELL_MS + 1))
  assert.deepEqual(s.inspectedArtifacts, [clue.id])
})

test('5b. leaving after three continuous seconds still counts, even if the timer fired late', () => {
  const clue = keyClues(investigating())[0]
  const s = run(investigating(), visible(clue.id, T0), hidden(clue.id, T0 + CLUE_DWELL_MS + 200))
  assert.deepEqual(s.inspectedArtifacts, [clue.id])
})

test('6. unrelated content, even in the same app, does not unlock a clue', () => {
  const state = withSameAppClues()
  const clues = keyClues(state)
  const app = clues.find(c => clues.filter(o => o.app === c.app).length > 1)!.app
  const [shown, notShown] = clues.filter(c => c.app === app)
  const s = run(state, visible(shown.id, T0), tick(T0 + CLUE_DWELL_MS + 1))
  assert.deepEqual(s.inspectedArtifacts, [shown.id], 'only the clue whose content was on screen')
  assert.equal(s.inspectedArtifacts.includes(notShown.id), false)
  for (const id of ['ambient:messages:1', 'MK-PACKAGE', 'nb-directory']) {
    assert.equal(gameReducer(state, visible(id, T0)), state, `${id} is not a clue`)
  }
})

test('7. a discovered clue is never discovered twice', () => {
  const clue = keyClues(investigating())[0]
  let s = run(investigating(), visible(clue.id, T0), tick(T0 + CLUE_DWELL_MS + 1))
  const found = s
  s = run(s, visible(clue.id, T0 + 5000), tick(T0 + 9000), hidden(clue.id, T0 + 9500), { type: 'INSPECT_ARTIFACT', artifactId: clue.id, now: T0 + 9600 })
  assert.equal(s, found, 'no state change at all')
  assert.equal(s.inspectedArtifacts.filter(id => id === clue.id).length, 1)
})

test('8. a discovered clue stays discovered after refresh; an unfinished timer starts over', () => {
  const storage = memoryStorage()
  const [a, b] = keyClues(investigating())
  const s = run(investigating(), visible(a.id, T0), tick(T0 + CLUE_DWELL_MS + 1), visible(b.id, T0 + CLUE_DWELL_MS + 1))
  saveGame(s, storage)
  const restored = loadGame(storage)
  assert.deepEqual(restored.inspectedArtifacts, [a.id])
  assert.deepEqual(restored.clueViewing, {}, 'time away from the page never counts')
  assert.deepEqual(gameReducer(restored, tick(T0 + 99_000)).inspectedArtifacts, [a.id])
})

test('9. clues from future encounters, inactive scenarios or the other character cannot be discovered', () => {
  const idle = started()
  const own = currentEncounter(idle)!.artifacts[0]
  // Before and during the incident (S1) the encounter's own clues are not open yet.
  assert.equal(gameReducer(idle, visible(own.id, T0)), idle)
  const intro = gameReducer(idle, { type: 'TRIGGER_ENCOUNTER' })
  assert.equal(gameReducer(intro, visible(own.id, T0)), intro)

  const s = investigating()
  const mika = CHARACTERS.find(c => c.id === 'mika')!
  const rafa = CHARACTERS.find(c => c.id === 'rafa')!
  const future = mika.encounters.filter(e => e.id !== currentEncounter(s)!.id).flatMap(e => e.artifacts)
  for (const artifact of [...future, ...rafa.encounters.flatMap(e => e.artifacts)]) {
    assert.equal(gameReducer(s, visible(artifact.id, T0)), s, artifact.id)
    assert.equal(gameReducer(s, { type: 'INSPECT_ARTIFACT', artifactId: artifact.id, now: T0 }), s, artifact.id)
  }
  // A timer left over from an encounter that has ended is dropped, not honoured.
  const stale = { ...s, clueViewing: { [future[0].id]: T0 } }
  assert.deepEqual(gameReducer(stale, tick(T0 + 10_000)).inspectedArtifacts, [])
})

test('10. discovering clues is optional and does not block the decision', () => {
  for (const character of CHARACTERS) {
    let s = investigating(character.id, 77)
    const encounter = currentEncounter(s)!
    assert.equal(s.narrative.pendingDecisionId, `${encounter.id}-D1`, character.id)
    for (const clue of keyClues(s)) s = gameReducer(s, visible(clue.id, T0))
    s = gameReducer(s, tick(T0 + CLUE_DWELL_MS + 1))
    assert.equal(s.narrative.pendingDecisionId, `${encounter.id}-D1`, character.id)
  }
})

test('resolution is possible without clues and earns no investigation bonus', () => {
  const ready = takeInNarrative(openIncident(gameReducer(started(), { type: 'TRIGGER_ENCOUNTER' })))
  const encounter = currentEncounter(ready)!
  const decisionId = `${encounter.id}-D1`
  const open = gameReducer(ready, { type: 'OPEN_DECISION', decisionId })
  const correctChoice = encounter.choices.find(choice => choice.isCorrect)!
  const resolved = gameReducer(open, { type: 'CHOOSE', choiceId: correctChoice.id, decisionId, now: T0 + 1000 })

  assert.equal(resolved.phase, 'CONSEQUENCE')
  assert.equal(resolved.decisionHistory[0]?.inspectedKeyEvidence, 0)
  assert.equal(resolved.decisionHistory[0]?.score.clueBonus, 0)
  assert.equal(gameReducer(resolved, visible(encounter.artifacts[0]!.id, T0 + 5000)), resolved, 'no clues are collected after resolution')
})

test('elapsed clue dwell is settled before scoring, preserving the maximum three-clue bonus', () => {
  let ready = takeInNarrative(openIncident(gameReducer(started(), { type: 'TRIGGER_ENCOUNTER' })))
  const encounter = currentEncounter(ready)!
  for (const clue of keyClues(ready)) ready = gameReducer(ready, visible(clue.id, T0))

  const decisionId = `${encounter.id}-D1`
  const open = gameReducer(ready, { type: 'OPEN_DECISION', decisionId })
  const correctChoice = encounter.choices.find(choice => choice.isCorrect)!
  const resolved = gameReducer(open, {
    type: 'CHOOSE',
    choiceId: correctChoice.id,
    decisionId,
    now: T0 + CLUE_DWELL_MS + 1,
  })

  assert.equal(resolved.decisionHistory[0]?.inspectedKeyEvidence, 3)
  assert.equal(resolved.decisionHistory[0]?.score.clueBonus, 10)
  assert.equal(resolved.inspectedArtifacts.length, 3)
})

test('10b. viewing clues does not bypass the other requirements', () => {
  // Clues found before the narrative is read: still no decision until it is read.
  let s = openIncident(gameReducer(started(), { type: 'TRIGGER_ENCOUNTER' }))
  for (const clue of keyClues(s)) s = gameReducer(s, visible(clue.id, T0))
  s = gameReducer(s, tick(T0 + CLUE_DWELL_MS + 1))
  assert.equal(s.inspectedArtifacts.length, keyClues(s).length)
  assert.equal(s.narrative.pendingDecisionId, null)
  s = takeInNarrative(s)
  assert.equal(s.narrative.pendingDecisionId, `${currentEncounter(s)!.id}-D1`)
})

test('11. revisiting a discovered clue needs no new wait', () => {
  const clue = keyClues(investigating())[0]
  let s = run(investigating(), visible(clue.id, T0), tick(T0 + CLUE_DWELL_MS + 1), hidden(clue.id, T0 + 4000))
  s = gameReducer(s, visible(clue.id, T0 + 20_000))
  assert.deepEqual(s.clueViewing, {}, 'no timer is started for a clue already found')
  assert.equal(nextClueDueAt(s), null)
  assert.ok(s.inspectedArtifacts.includes(clue.id))
})

test('12. the manual shortcut and the timer never double count', () => {
  const clue = keyClues(investigating())[0]
  let s = run(investigating(), visible(clue.id, T0), { type: 'INSPECT_ARTIFACT', artifactId: clue.id, now: T0 + 500 })
  assert.deepEqual(s.inspectedArtifacts, [clue.id])
  assert.deepEqual(s.clueViewing, {}, 'the pending timer is cleared')
  const after = s
  s = run(s, tick(T0 + CLUE_DWELL_MS + 1), hidden(clue.id, T0 + 4000))
  assert.equal(s, after)
})

test('every clue is shown in an app its character’s phone has, in the incident view when it describes the incident', () => {
  for (const character of CHARACTERS) {
    for (const encounter of character.encounters) {
      assert.equal(encounter.artifacts.length, 3, encounter.id)
      assert.equal(encounter.artifacts.filter(artifact => artifact.isKeyEvidence).length, 3, encounter.id)
      for (const artifact of encounter.artifacts) {
        const source = clueSource(encounter, artifact)
        assert.ok(character.apps.includes(source.app), artifact.id)
        assert.equal(source.surface, artifact.app === encounter.trigger.app ? 'incident' : 'app', artifact.id)
      }
    }
  }
})
