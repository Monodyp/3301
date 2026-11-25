import { test } from 'node:test'
import assert from 'node:assert/strict'

import { CHARACTERS, getEncounter, validateContent } from '../src/game/content/index.ts'
import {
  BACKEND_SCENARIO_IDS,
  SCENARIO_REGISTRY,
  SUPPORTED_PHONE_SURFACES,
  getScenarioDefinition,
  isScenarioId,
  validateScenarioAssignment,
  validateScenarioRegistry,
} from '../src/game/scenarioRegistry.ts'

test('registry covers the exact 16 backend scenario IDs once', () => {
  assert.deepEqual(SCENARIO_REGISTRY.map(entry => entry.scenarioId), BACKEND_SCENARIO_IDS)
  assert.equal(SCENARIO_REGISTRY.length, 16)
  assert.equal(new Set(SCENARIO_REGISTRY.map(entry => entry.scenarioId)).size, 16)
  assert.deepEqual(validateScenarioRegistry(), [])
  assert.equal(isScenarioId('MK-A1'), true)
  assert.equal(isScenarioId('RF-O2'), true)
  assert.equal(isScenarioId('MK-A4'), false)
})

test('each backend ID resolves to its original authored encounter and NPC identity', () => {
  for (const scenarioId of BACKEND_SCENARIO_IDS) {
    const definition = getScenarioDefinition(scenarioId)
    const authoredEncounter = getEncounter(scenarioId)

    assert.ok(definition)
    assert.ok(authoredEncounter)
    assert.equal(definition.encounter, authoredEncounter)
    assert.equal(definition.encounter.id, scenarioId)
    assert.equal(definition.npcIdentity, authoredEncounter.characterId)
  }

  assert.deepEqual(CHARACTERS.map(character => character.id), ['mika', 'rafa'])
  assert.deepEqual(validateContent(), [])
})

test('every action is grounded in the authored correct choice and has its own ID', () => {
  const actionIds = SCENARIO_REGISTRY.map(entry => entry.action.id)

  assert.equal(new Set(actionIds).size, BACKEND_SCENARIO_IDS.length)
  for (const entry of SCENARIO_REGISTRY) {
    const correctChoices = entry.encounter.choices.filter(choice => choice.isCorrect)
    assert.equal(correctChoices.length, 1)
    assert.equal(correctChoices[0]?.id, entry.action.authoredChoiceId)
    assert.ok(entry.action.primaryAction.length > 0)
    assert.ok(entry.action.successCondition.length > 0)
    assert.ok(entry.action.playerDescription.length > 0)
    assert.deepEqual(entry.action.incorrectBehavior, {
      kind: 'leave-unresolved',
      resolvesIncident: false,
    })
  }
})

test('every action uses a supported phone surface and declares its parameters', () => {
  for (const entry of SCENARIO_REGISTRY) {
    assert.ok(SUPPORTED_PHONE_SURFACES.includes(entry.action.surface))
    assert.ok(Array.isArray(entry.action.parameters))
    assert.ok(entry.action.steps.length > 0)
    assert.equal(entry.action.steps[0]?.surface, entry.action.surface)
    for (const step of entry.action.steps) {
      assert.ok(SUPPORTED_PHONE_SURFACES.includes(step.surface))
      assert.ok(step.label.length > 0)
      assert.ok(step.confirmation.length > 0)
    }
  }
})

test('registry validation detects omitted and duplicate mappings', () => {
  const missing = validateScenarioRegistry(SCENARIO_REGISTRY.slice(1))
  assert.ok(missing.some(problem => problem.includes('missing registry definition')))

  const duplicate = validateScenarioRegistry([...SCENARIO_REGISTRY, SCENARIO_REGISTRY[0]!])
  assert.ok(duplicate.some(problem => problem.includes('duplicate scenario ID')))

  const duplicateAction = SCENARIO_REGISTRY.map((entry, index) => (
    index === 1
      ? { ...entry, action: { ...entry.action, id: SCENARIO_REGISTRY[0]!.action.id } }
      : entry
  ))
  assert.ok(validateScenarioRegistry(duplicateAction).some(problem => problem.includes('duplicate resolution action ID')))
})

test('registry validation detects a changed authored encounter reference', () => {
  const mismapped = SCENARIO_REGISTRY.map((entry, index) => (
    index === 0
      ? { ...entry, encounter: CHARACTERS[1]!.encounters[0]! }
      : entry
  ))

  assert.ok(
    validateScenarioRegistry(mismapped).some(problem => problem.includes('does not reference its existing authored encounter')),
  )
})

test('registry validation detects scenarios without authored encounters', () => {
  const problems = validateScenarioRegistry(SCENARIO_REGISTRY, [])
  assert.ok(problems.some(problem => problem.includes('no matching authored encounter')))
})

test('backend assignments must contain five known unique IDs and retain server order', () => {
  const orderedIds = ['RF-R3', 'MK-A1', 'RF-O2', 'MK-R2', 'RF-A1']
  const valid = validateScenarioAssignment(orderedIds)
  assert.equal(valid.ok, true)
  if (valid.ok) {
    assert.deepEqual(valid.scenarioIds, orderedIds)
    assert.deepEqual(valid.entries.map(entry => entry.scenarioId), orderedIds)
  }

  assert.equal(validateScenarioAssignment(['MK-A1', 'RF-A1', 'MK-R1', 'RF-R1']).ok, false)
  assert.equal(validateScenarioAssignment(['MK-A1', 'MK-A1', 'RF-A1', 'RF-R1', 'MK-R1']).ok, false)
  assert.equal(validateScenarioAssignment(['MK-A1', 'RF-A1', 'MK-R1', 'RF-R1', 'UNKNOWN']).ok, false)
  assert.equal(validateScenarioAssignment(null).ok, false)
})
