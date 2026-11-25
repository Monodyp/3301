import { test } from 'node:test'
import assert from 'node:assert/strict'

import { CHARACTERS, getEncounter, validateContent } from '../src/game/content/index.ts'
import { CHARACTER_PHONE_DATA } from '../src/data/characterData.ts'
import { trustedLocalSearch } from '../src/components/applications/phoneInteractionUtils.ts'
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

test('every scenario has unique native interactions linked to each action step and authored wrong choices', () => {
  const interactionIds = new Set<string>()
  for (const entry of SCENARIO_REGISTRY) {
    const correctInteractions = entry.action.interactions.filter(interaction => interaction.classification === 'correct')
    const incorrectInteractions = entry.action.interactions.filter(interaction => interaction.classification === 'incorrect')

    assert.equal(correctInteractions.length, entry.action.steps.length, entry.scenarioId)
    assert.ok(incorrectInteractions.length > 0, entry.scenarioId)
    for (const step of entry.action.steps) {
      assert.equal(correctInteractions.filter(interaction => interaction.stepId === step.id).length, 1, `${entry.scenarioId} ${step.id}`)
    }
    for (const interaction of entry.action.interactions) {
      assert.equal(interactionIds.has(interaction.id), false, interaction.id)
      interactionIds.add(interaction.id)
      assert.ok(SUPPORTED_PHONE_SURFACES.includes(interaction.surface))
      if (interaction.classification === 'incorrect') {
        assert.ok(interaction.wrongChoiceId)
        assert.ok(entry.encounter.choices.some(choice => choice.id === interaction.wrongChoiceId && !choice.isCorrect))
        assert.ok(interaction.severity && interaction.severity >= 1 && interaction.severity <= 4)
      } else if (interaction.control === 'search') {
        assert.ok(interaction.expectedQuery?.trim(), `${entry.scenarioId} requires a meaningful browser query`)
      }
      if (interaction.expectedContact) {
        assert.ok(
          CHARACTER_PHONE_DATA[entry.npcIdentity]?.contacts.some(contact => contact.name === interaction.expectedContact),
          `${entry.scenarioId} requires the trusted contact to exist in the NPC phone`,
        )
      }
    }
  }
})

test('search interactions return contextual local outcomes for the seven incomplete scenarios', () => {
  const incompleteScenarios = ['MK-A1', 'MK-A3', 'MK-R2', 'MK-O1', 'MK-O2', 'RF-A3', 'RF-O1']
  for (const scenarioId of incompleteScenarios) {
    const entry = SCENARIO_REGISTRY.find(item => item.scenarioId === scenarioId)!
    const search = entry.action.interactions.find(item => item.control === 'search' && item.classification === 'correct')
    assert.ok(search?.expectedQuery, `${scenarioId} has a meaningful trusted-resource search`)

    const outcome = trustedLocalSearch(
      search.expectedQuery,
      search.expectedQuery,
      CHARACTER_PHONE_DATA[entry.npcIdentity]!.profile.location,
      [],
      entry.encounter.artifacts,
    )
    assert.notEqual(outcome.kind, 'miss', scenarioId)
    assert.ok(outcome.title.trim(), `${scenarioId} has a result title`)
    assert.ok(outcome.kind !== 'miss' && outcome.detail.trim(), `${scenarioId} has contextual result details`)
  }

  const missed = trustedLocalSearch('unrelated phrase', 'agency', 'Northbridge', [], [])
  assert.equal(missed.kind, 'miss')
  assert.ok(missed.detail.trim())
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
