// Gameplay preservation: compares the game with a snapshot taken before
// automatic clue discovery and attack notifications were added
// (tests/fixtures/gameplay-baseline.json).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { CHARACTERS } from '../src/game/content/index.ts'
import { ENCOUNTER_NARRATIVES } from '../src/game/content/scenarios.ts'
import { currentEncounter, gameReducer, initialGameState } from '../src/game/engine.ts'
import { CLUE_DWELL_MS } from '../src/game/narrative.ts'
import type { GameState } from '../src/game/types.ts'
import { T0, findEvidence, openIncident, run, takeInNarrative } from './support/play.ts'

const baseline = JSON.parse(readFileSync(new URL('./fixtures/gameplay-baseline.json', import.meta.url), 'utf8'))

test('1. encounter order is unchanged', () => {
  for (const [key, queue] of Object.entries(baseline.queues)) {
    const [characterId, seed] = key.split(':')
    const s = gameReducer(initialGameState(), { type: 'START_RUN', seed: Number(seed), now: 1, characterId })
    assert.deepEqual(s.encounterQueue, queue, key)
  }
})

test('2–3. scenario requirements and decision prerequisites are unchanged', () => {
  for (const n of ENCOUNTER_NARRATIVES.values()) {
    const now = {
      requires: n.requiresEncounters,
      scenarios: n.scenarios.map(s => ({ id: s.id, startsWhen: s.startsWhen, actions: s.requiredActions.map(a => ({ id: a.id, anyOf: a.anyOf, presents: a.presents })), narrative: s.narrativeContent.map(c => c.id), evidence: s.requiredEvidence, decisionId: s.decisionId, completesWhen: s.completesWhen, next: s.next })),
      decision: n.decision,
    }
    assert.deepEqual(now, baseline.requirements[n.encounterId], n.encounterId)
  }
})

test('4. the decision unlocks at the same point whether clues are viewed or inspected', () => {
  for (const character of CHARACTERS) {
    const start = run(initialGameState(), { type: 'START_RUN', seed: 4242, now: T0, characterId: character.id }, { type: 'ENTER_PHONE' }, { type: 'TRIGGER_ENCOUNTER' })
    const read = takeInNarrative(openIncident(start))
    const keys = currentEncounter(read)!.artifacts.filter(a => a.isKeyEvidence)

    const viaInspect = findEvidence(read)
    let viaViewing: GameState = read
    for (const clue of keys.slice(0, -1)) viaViewing = run(viaViewing, { type: 'CLUE_VISIBLE', artifactId: clue.id, now: T0 }, { type: 'CLUE_TICK', now: T0 + CLUE_DWELL_MS })
    assert.equal(viaViewing.narrative.pendingDecisionId, null, 'still locked with one clue left')
    const last = keys[keys.length - 1]
    viaViewing = run(viaViewing, { type: 'CLUE_VISIBLE', artifactId: last.id, now: T0 + CLUE_DWELL_MS }, { type: 'CLUE_TICK', now: T0 + 2 * CLUE_DWELL_MS })

    assert.equal(viaViewing.narrative.pendingDecisionId, viaInspect.narrative.pendingDecisionId)
    assert.deepEqual(viaViewing.narrative.completedActions, viaInspect.narrative.completedActions)
    assert.deepEqual([...viaViewing.inspectedArtifacts].sort(), [...viaInspect.inspectedArtifacts].sort())
    assert.equal(viaViewing.phase, 'INVESTIGATION', 'the decision is offered, not opened')
  }
})

test('5. character narrative content is unchanged', () => {
  const sha = createHash('sha256').update(JSON.stringify(CHARACTERS)).digest('hex')
  assert.equal(sha, baseline.contentSha256)
})
