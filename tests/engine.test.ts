// Engine tests (Stage 4, section 14). Run with: npm test
// Uses Node's built-in test runner; no extra packages needed (Node 22.18+).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { CHARACTERS, validateContent } from '../src/game/content/index.ts'
import { getEncounterNarrative, PHONE_TARGETS, validateNarrative } from '../src/game/content/scenarios.ts'
import {
  ENCOUNTERS_PER_RUN,
  EVENT_SCENARIOS_PER_RUN,
  canDispatch,
  currentEncounter,
  currentNpc,
  gameReducer,
  initialGameState,
  nextHintDueAt,
  orderedChoices,
  type GameAction,
} from '../src/game/engine.ts'
import { createRng, shuffle } from '../src/game/random.ts'
import { clueBonus, eventSurvivalRating, horrorStageFor, scoreDecision, survivalRating, timeBonus } from '../src/game/scoring.ts'
import { EVENT_SAVE_KEY, loadGame, SAVE_KEY, saveGame } from '../src/game/storage.ts'
import { ARCHETYPES, type GameState } from '../src/game/types.ts'
import { EDUCATIONAL_DEBRIEF, feedbackForDecision, formatCompletionTime } from '../src/game/educational.ts'
import { BACKEND_SCENARIO_IDS, getScenarioDefinition, isScenarioId } from '../src/game/scenarioRegistry.ts'
import { availablePhoneInteractions } from '../src/components/applications/phoneInteractionUtils.ts'
import { findEvidence, investigateFully, openIncident, openPending, takeInNarrative } from './support/play.ts'

const T0 = 1_700_000_000_000

function run(state: GameState, ...actions: GameAction[]): GameState {
  return actions.reduce(gameReducer, state)
}

function started(seed = 42): GameState {
  return run(initialGameState(), { type: 'START_RUN', seed, now: T0 }, { type: 'ENTER_PHONE' })
}

const EVENT_ASSIGNMENT = ['RF-A1', 'MK-R1', 'RF-O2', 'MK-A2', 'RF-R3'] as const

function startedEventRun(scenarioIds: readonly string[] = EVENT_ASSIGNMENT): GameState {
  return run(initialGameState(), {
    type: 'START_ASSIGNED_RUN',
    runId: 'authoritative-run-1',
    scenarioIds,
    seed: 777,
    now: T0,
  }, { type: 'ENTER_PHONE' })
}

function readyEventScenario(state: GameState): GameState {
  const encounter = currentEncounter(state)
  assert.ok(encounter)
  let next = gameReducer(state, { type: 'TRIGGER_ENCOUNTER' })
  next = gameReducer(next, {
    type: 'REPORT_PHONE_EVENT',
    event: {
      kind: 'CONVERSATION_OPENED',
      app: encounter.trigger.app,
      target: PHONE_TARGETS.incident(encounter.id),
    },
    now: T0 + 1,
  })
  const investigation = getEncounterNarrative(encounter.id)?.scenarios[1]
  assert.ok(investigation)
  for (const requiredAction of investigation.requiredActions) {
    const event = requiredAction.anyOf[0]
    assert.ok(event)
    next = gameReducer(next, { type: 'REPORT_PHONE_EVENT', event, now: T0 + 2 })
  }
  return next
}

function openedEventScenario(state: GameState): GameState {
  const encounter = currentEncounter(state)
  assert.ok(encounter)
  let next = gameReducer(state, { type: 'TRIGGER_ENCOUNTER' })
  return gameReducer(next, {
    type: 'REPORT_PHONE_EVENT',
    event: {
      kind: 'CONVERSATION_OPENED',
      app: encounter.trigger.app,
      target: PHONE_TARGETS.incident(encounter.id),
    },
    now: T0 + 1,
  })
}

function completeEventAction(state: GameState): GameState {
  const encounter = currentEncounter(state)
  assert.ok(encounter)
  const entry = isScenarioId(encounter.id) ? getScenarioDefinition(encounter.id) : undefined
  assert.ok(entry)
  let next = state
  for (const step of entry.action.steps) {
    next = gameReducer(next, {
      type: 'PERFORM_PROTECTIVE_ACTION',
      scenarioId: entry.scenarioId,
      actionId: entry.action.id,
      stepId: step.id,
      surface: step.surface,
      now: T0 + 10,
    })
  }
  return next
}

// Plays the current encounter: open the incident, read it, inspect everything, decide after `seconds`.
function playEncounter(state: GameState, pickCorrect: boolean, seconds = 10): GameState {
  const startAt = T0 + state.currentEncounterIndex * 60_000
  let s = takeInNarrative(openIncident(gameReducer(state, { type: 'TRIGGER_ENCOUNTER' }), startAt))
  s = openPending(findEvidence(s, T0, false))
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

function decisionReady(state: GameState): GameState {
  return openPending(investigateFully(state))
}

// Trigger the incident and open it: the investigation starts at `now`.
function investigating(state: GameState, now = T0): GameState {
  return openIncident(gameReducer(state, { type: 'TRIGGER_ENCOUNTER' }), now)
}

test('content: every character passes the integrity checks', () => {
  assert.deepEqual(validateContent(), [])
  assert.deepEqual(validateNarrative(), [])
})

test('every authored character has a complete, sequential encounter run', () => {
  for (const { id: characterId } of CHARACTERS) {
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

test('assigned event runs keep exactly five unique scenarios in backend order', () => {
  const state = startedEventRun()
  assert.equal(state.runMode, 'event')
  assert.equal(state.eventRunId, 'authoritative-run-1')
  assert.equal(state.characterId, null)
  assert.equal(state.encounterQueue.length, EVENT_SCENARIOS_PER_RUN)
  assert.deepEqual(state.encounterQueue, EVENT_ASSIGNMENT)
  assert.equal(new Set(state.encounterQueue).size, EVENT_SCENARIOS_PER_RUN)

  for (let index = 0; index < EVENT_ASSIGNMENT.length; index++) {
    const assignedId = EVENT_ASSIGNMENT[index]
    const entryCharacterId = assignedId.startsWith('MK-') ? 'mika' : 'rafa'
    assert.equal(currentEncounter({ ...state, currentEncounterIndex: index })?.id, assignedId)
    assert.equal(currentNpc({ ...state, currentEncounterIndex: index })?.id, entryCharacterId)
  }
})

test('assigned scenarios complete in order and the run stops after five', () => {
  let state = startedEventRun()
  for (let index = 0; index < EVENT_SCENARIOS_PER_RUN; index++) {
    assert.equal(currentEncounter(state)?.id, EVENT_ASSIGNMENT[index])
    state = gameReducer(completeEventAction(readyEventScenario(state)), { type: 'CONTINUE' })
    state = gameReducer(state, { type: 'NEXT_ENCOUNTER', now: T0 + (index + 1) * 60_000 })
  }

  assert.equal(state.phase, 'RESULTS')
  assert.equal(state.completedEncounters.length, EVENT_SCENARIOS_PER_RUN)
  assert.deepEqual(state.completedEncounters, EVENT_ASSIGNMENT)
  assert.equal(state.attacks.triggered.length, EVENT_SCENARIOS_PER_RUN)
  assert.equal(gameReducer(state, { type: 'PLAY_AGAIN', seed: 888, now: T0 + 500_000 }), state)
})

test('all 16 assigned scenarios resolve through their own registry interactions', () => {
  for (const scenarioId of BACKEND_SCENARIO_IDS) {
    const assignment = [scenarioId, ...BACKEND_SCENARIO_IDS.filter(id => id !== scenarioId)].slice(0, EVENT_SCENARIOS_PER_RUN)
    const entry = getScenarioDefinition(scenarioId)!
    let state = readyEventScenario(startedEventRun(assignment))

    for (const step of entry.action.steps) {
      const interaction = entry.action.interactions.find(item => item.classification === 'correct' && item.stepId === step.id)
      assert.ok(interaction, `${scenarioId} ${step.id} has a native interaction`)
      const available = availablePhoneInteractions({
        state,
        encounter: currentEncounter(state),
        resolutionAction: entry,
      }, step.surface)
      assert.ok(available.some(item => item.id === interaction.id), `${scenarioId} ${interaction.id} is exposed in its native app`)
      assert.ok(
        entry.action.interactions
          .filter(item => item.classification === 'incorrect' && item.surface === step.surface)
          .every(item => available.some(candidate => candidate.id === item.id)),
        `${scenarioId} harmful alternatives are available in their native app`,
      )
      const parameters = interaction.expectedQuery
        ? { query: interaction.expectedQuery }
        : interaction.expectedContact
          ? { contactName: interaction.expectedContact }
          : undefined
      if (interaction.expectedQuery || interaction.expectedContact) {
        const rejected = gameReducer(state, {
          type: 'PERFORM_PHONE_INTERACTION',
          scenarioId,
          interactionId: interaction.id,
          surface: interaction.surface,
          parameters: interaction.expectedQuery ? { query: 'unrelated search' } : { contactName: 'Untrusted contact' },
          now: T0 + 9,
        })
        assert.equal(rejected, state, `${scenarioId} validates required interaction parameters`)
      }
      state = gameReducer(state, {
        type: 'PERFORM_PHONE_INTERACTION',
        scenarioId,
        interactionId: interaction.id,
        surface: interaction.surface,
        parameters,
        now: T0 + 10,
      })
    }

    assert.ok(state.completedEncounters.includes(scenarioId), `${scenarioId} resolves`)
    assert.deepEqual(
      state.performedPhoneInteractions[scenarioId],
      entry.action.interactions.filter(item => item.classification === 'correct').map(item => item.id),
    )
  }
})

test('harmful native interactions escalate corruption, persist, and cannot resolve another scenario', () => {
  const scenarioId = 'MK-A1'
  const assignment = [scenarioId, 'RF-A1', 'MK-R1', 'RF-O2', 'MK-O2']
  const entry = getScenarioDefinition(scenarioId)!
  const wrongInteractions = entry.action.interactions.filter(item => item.classification === 'incorrect')
  const wrongInteraction = wrongInteractions[0]!
  const secondWrongInteraction = wrongInteractions[1]!
  const correctInteractions = entry.action.interactions.filter(item => item.classification === 'correct')
  const correctFirstStep = correctInteractions[0]!
  const stabilizingInteraction = correctInteractions[1]!
  let state = readyEventScenario(startedEventRun(assignment))

  const wrongAction = {
    type: 'PERFORM_PHONE_INTERACTION' as const,
    scenarioId,
    interactionId: wrongInteraction.id,
    surface: wrongInteraction.surface,
    now: T0 + 20,
  }
  state = gameReducer(state, wrongAction)
  assert.equal(state.phase, 'INVESTIGATION')
  assert.equal(state.resolutionSteps[scenarioId]?.length ?? 0, 0)
  assert.equal(state.corruptionByScenario[scenarioId], wrongInteraction.severity)
  assert.ok(state.consequences.some(item => item.encounterId === scenarioId && item.kind === 'glitch'))
  assert.equal(gameReducer(state, wrongAction), state, 'the same harmful interaction cannot be applied twice')
  state = gameReducer(state, {
    type: 'PERFORM_PHONE_INTERACTION',
    scenarioId,
    interactionId: secondWrongInteraction.id,
    surface: secondWrongInteraction.surface,
    now: T0 + 25,
  })
  assert.equal(state.corruptionByScenario[scenarioId], Math.min(4, (wrongInteraction.severity ?? 0) + (secondWrongInteraction.severity ?? 0)))

  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  }
  saveGame(state, storage)
  state = loadGame(storage, 'event')
  const accumulatedCorruption = Math.min(4, (wrongInteraction.severity ?? 0) + (secondWrongInteraction.severity ?? 0))
  assert.equal(state.corruptionByScenario[scenarioId], accumulatedCorruption)

  state = gameReducer(state, {
    type: 'PERFORM_PHONE_INTERACTION',
    scenarioId,
    interactionId: correctFirstStep.id,
    surface: correctFirstStep.surface,
    now: T0 + 30,
  })
  assert.equal(state.corruptionByScenario[scenarioId], accumulatedCorruption, 'a correct but non-stabilizing step does not reduce corruption')
  state = gameReducer(state, {
    type: 'PERFORM_PHONE_INTERACTION',
    scenarioId,
    interactionId: stabilizingInteraction.id,
    surface: stabilizingInteraction.surface,
    now: T0 + 35,
  })
  assert.equal(state.corruptionByScenario[scenarioId], 3, 'a correct step stabilizes incrementally rather than clearing corruption')

  for (const step of entry.action.steps.slice(2)) {
    const interaction = entry.action.interactions.find(item => item.classification === 'correct' && item.stepId === step.id)!
    state = gameReducer(state, {
      type: 'PERFORM_PHONE_INTERACTION',
      scenarioId,
      interactionId: interaction.id,
      surface: interaction.surface,
      parameters: interaction.expectedQuery
        ? { query: interaction.expectedQuery }
        : interaction.expectedContact
          ? { contactName: interaction.expectedContact }
          : undefined,
      now: T0 + 40,
    })
  }
  assert.ok(state.completedEncounters.includes(scenarioId))
  const resolvedState = state
  state = gameReducer(state, { ...wrongAction, now: T0 + 50 })
  assert.equal(state, resolvedState, 'resolved incidents ignore later harmful interactions')
  state = gameReducer(state, { type: 'CONTINUE' })
  state = gameReducer(state, { type: 'NEXT_ENCOUNTER', now: T0 + 60 })
  assert.equal(state.corruptionByScenario['RF-A1'] ?? 0, 0, 'corruption does not leak to the next scenario')
})

test('all 16 scenario actions resolve only their assigned encounter without requiring evidence', () => {
  for (const scenarioId of BACKEND_SCENARIO_IDS) {
    const assignment = [scenarioId, ...BACKEND_SCENARIO_IDS.filter(id => id !== scenarioId).slice(0, 4)]
    const runState = startedEventRun(assignment)
    const ready = readyEventScenario(runState)
    const resolved = completeEventAction(ready)

    assert.equal(resolved.phase, 'CONSEQUENCE', scenarioId)
    assert.deepEqual(resolved.completedEncounters, [scenarioId], scenarioId)
    assert.deepEqual(resolved.inspectedArtifacts, [], scenarioId)
    assert.equal(resolved.decisionHistory.length, 1, scenarioId)
    assert.equal(resolved.decisionHistory[0]?.correct, true, scenarioId)
    assert.equal(resolved.decisionHistory[0]?.choiceId, getScenarioDefinition(scenarioId)?.action.authoredChoiceId, scenarioId)
    assert.ok(resolved.playerScore >= 100, scenarioId)
    assert.equal(resolved.resolutionSteps[scenarioId]?.length, getScenarioDefinition(scenarioId)?.action.steps.length, scenarioId)
  }
})

test('event actions can resolve before narrative or evidence investigation', () => {
  const scenarioId = 'MK-A1'
  const assignment = [scenarioId, ...BACKEND_SCENARIO_IDS.filter(id => id !== scenarioId).slice(0, 4)]
  const opened = openedEventScenario(startedEventRun(assignment))
  assert.equal(opened.narrative.activeScenarioId, `${scenarioId}-S2`)
  assert.deepEqual(opened.inspectedArtifacts, [])
  assert.equal(opened.narrative.presentedNarrative.length, 1, 'the incident notice is presented when it arrives')
  assert.equal(opened.narrative.presentedNarrative.includes(`${scenarioId}:thread`), false)
  assert.deepEqual(opened.narrative.completedActions[`${scenarioId}-S2`] ?? [], [])

  const resolved = completeEventAction(opened)
  assert.equal(resolved.phase, 'CONSEQUENCE')
  assert.equal(resolved.decisionHistory[0]?.score.clueBonus, 0)
  assert.deepEqual(resolved.inspectedArtifacts, [])
})

test('reading evidence informs event play but never resolves the incident by itself', () => {
  const scenarioId = 'MK-A1'
  const ready = readyEventScenario(startedEventRun([scenarioId, ...BACKEND_SCENARIO_IDS.filter(id => id !== scenarioId).slice(0, 4)]))
  const artifact = getScenarioDefinition(scenarioId)!.encounter.artifacts[0]!
  const afterEvidence = gameReducer(ready, { type: 'INSPECT_ARTIFACT', artifactId: artifact.id, now: T0 + 3 })
  assert.equal(afterEvidence.phase, 'INVESTIGATION')
  assert.deepEqual(afterEvidence.completedEncounters, [])
  assert.deepEqual(afterEvidence.resolutionSteps, {})
  assert.equal(afterEvidence.decisionHistory.length, 0)
})

test('protective actions require each step in order and duplicate submissions award no extra points', () => {
  const scenarioId = 'RF-A1'
  const ready = readyEventScenario(startedEventRun([scenarioId, ...BACKEND_SCENARIO_IDS.filter(id => id !== scenarioId).slice(0, 4)]))
  const entry = getScenarioDefinition(scenarioId)!
  const firstStep = entry.action.steps[0]!
  const secondStep = entry.action.steps[1]!
  const first = gameReducer(ready, {
    type: 'PERFORM_PROTECTIVE_ACTION',
    scenarioId,
    actionId: entry.action.id,
    stepId: firstStep.id,
    surface: firstStep.surface,
    now: T0 + 3,
  })
  assert.equal(first.phase, 'INVESTIGATION')
  assert.equal(first.decisionHistory.length, 0)
  assert.deepEqual(first.resolutionSteps[scenarioId], [firstStep.id])
  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  }
  saveGame(first, storage)
  const refreshed = loadGame(storage, 'event')
  assert.deepEqual(refreshed.resolutionSteps[scenarioId], [firstStep.id])
  assert.equal(refreshed.resolutionActionFeedback?.outcome, 'step-completed')
  const duplicateStep = gameReducer(first, {
    type: 'PERFORM_PROTECTIVE_ACTION',
    scenarioId,
    actionId: entry.action.id,
    stepId: firstStep.id,
    surface: firstStep.surface,
    now: T0 + 4,
  })
  assert.equal(duplicateStep, first)
  const wrongSurface = gameReducer(first, {
    type: 'PERFORM_PROTECTIVE_ACTION',
    scenarioId,
    actionId: entry.action.id,
    stepId: secondStep.id,
    surface: 'messages',
    now: T0 + 4,
  })
  assert.equal(wrongSurface.phase, 'INVESTIGATION')
  assert.deepEqual(wrongSurface.resolutionSteps, first.resolutionSteps)
  assert.equal(wrongSurface.resolutionActionFeedback?.outcome, 'rejected')

  const resolved = completeEventAction(first)
  const duplicate = gameReducer(resolved, {
    type: 'PERFORM_PROTECTIVE_ACTION',
    scenarioId,
    actionId: entry.action.id,
    stepId: secondStep.id,
    surface: secondStep.surface,
    now: T0 + 5,
  })
  assert.equal(resolved.phase, 'CONSEQUENCE')
  assert.equal(resolved.decisionHistory.length, 1)
  assert.equal(duplicate, resolved)
})

test('wrong scenario actions and the old event quiz cannot resolve an incident', () => {
  const scenarioId = 'MK-R1'
  const ready = readyEventScenario(startedEventRun([scenarioId, ...BACKEND_SCENARIO_IDS.filter(id => id !== scenarioId).slice(0, 4)]))
  const entry = getScenarioDefinition(scenarioId)!
  const other = getScenarioDefinition('RF-R1')!
  const step = entry.action.steps[0]!
  assert.equal(gameReducer(ready, {
    type: 'PERFORM_PROTECTIVE_ACTION',
    scenarioId: other.scenarioId,
    actionId: other.action.id,
    stepId: other.action.steps[0]!.id,
    surface: other.action.steps[0]!.surface,
    now: T0 + 3,
  }), ready)
  const wrongAction = gameReducer(ready, {
    type: 'PERFORM_PROTECTIVE_ACTION',
    scenarioId,
    actionId: other.action.id,
    stepId: other.action.steps[0]!.id,
    surface: other.action.steps[0]!.surface,
    now: T0 + 3,
  })
  assert.equal(wrongAction.phase, 'INVESTIGATION')
  assert.deepEqual(wrongAction.resolutionSteps, {})
  assert.equal(wrongAction.resolutionActionFeedback?.outcome, 'rejected')
  const wrongStep = gameReducer(ready, {
    type: 'PERFORM_PROTECTIVE_ACTION',
    scenarioId,
    actionId: entry.action.id,
    stepId: 'incorrect-step',
    surface: step.surface,
    now: T0 + 3,
  })
  assert.equal(wrongStep.phase, 'INVESTIGATION')
  assert.deepEqual(wrongStep.resolutionSteps, {})
  assert.equal(wrongStep.resolutionActionFeedback?.outcome, 'rejected')
  const correctChoice = entry.encounter.choices.find(choice => choice.isCorrect)!
  assert.equal(gameReducer(ready, {
    type: 'CHOOSE',
    choiceId: correctChoice.id,
    decisionId: `${scenarioId}-D1`,
    now: T0 + 3,
  }), ready)
  assert.equal(ready.phase, 'INVESTIGATION')
  assert.equal(ready.decisionHistory.length, 0)
  const legacyQuiz = {
    ...ready,
    phase: 'DECISION' as const,
    narrative: { ...ready.narrative, pendingDecisionId: `${scenarioId}-D1` },
  }
  assert.equal(gameReducer(legacyQuiz, {
    type: 'CHOOSE',
    choiceId: correctChoice.id,
    decisionId: `${scenarioId}-D1`,
    now: T0 + 4,
  }), legacyQuiz)
})

test('invalid assigned runs do not fall back to a character-based practice run', () => {
  const initial = initialGameState()
  for (const scenarioIds of [
    ['MK-A1', 'RF-A1', 'MK-R1', 'RF-R1'],
    ['MK-A1', 'RF-A1', 'MK-R1', 'RF-R1', 'RF-O1', 'MK-O1'],
    ['MK-A1', 'RF-A1', 'MK-R1', 'RF-R1', 'UNKNOWN'],
    ['MK-A1', 'RF-A1', 'MK-A1', 'RF-R1', 'MK-R1'],
  ]) {
    const next = gameReducer(initial, {
      type: 'START_ASSIGNED_RUN',
      runId: 'authoritative-run-invalid',
      scenarioIds,
      seed: 1,
      now: T0,
    })
    assert.equal(next, initial)
    assert.equal(next.characterId, null)
    assert.equal(next.runMode, null)
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
  let s = decisionReady(started())
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
  let s = decisionReady(started())
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

test('practice and event saves stay separate and event refresh preserves backend order', () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  }
  const practice = started(100)
  const event = startedEventRun()
  saveGame(practice, storage)
  saveGame(event, storage)

  assert.ok(store.has(SAVE_KEY))
  assert.ok(store.has(EVENT_SAVE_KEY))
  assert.equal(loadGame(storage, 'practice').runMode, 'practice')
  const refreshed = loadGame(storage, 'event')
  assert.equal(refreshed.eventRunId, event.eventRunId)
  assert.deepEqual(refreshed.encounterQueue, EVENT_ASSIGNMENT)
  assert.equal(refreshed.characterId, null)
})

test('valid legacy v3 saves migrate as local practice; invalid legacy saves are discarded', () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  }
  const practice = started(101)
  const legacy = JSON.parse(JSON.stringify(practice)) as Record<string, unknown>
  legacy.saveVersion = 3
  delete legacy.runMode
  delete legacy.eventRunId
  store.set(SAVE_KEY, JSON.stringify(legacy))

  const migrated = loadGame(storage, 'practice')
  assert.equal(migrated.saveVersion, 6)
  assert.equal(migrated.runMode, 'practice')
  assert.deepEqual(migrated.encounterQueue, practice.encounterQueue)
  assert.deepEqual(migrated.resolutionSteps, {})

  legacy.encounterQueue = ['MK-A1', 'MK-A1']
  store.set(SAVE_KEY, JSON.stringify(legacy))
  const discarded = loadGame(storage, 'practice')
  assert.equal(discarded.phase, 'MAIN_MENU')
  assert.equal(store.has(SAVE_KEY), false)
})

test('valid legacy v4 practice and event saves migrate without losing their runs', () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  }
  const legacy = JSON.parse(JSON.stringify(startedEventRun())) as Record<string, unknown>
  legacy.saveVersion = 4
  delete legacy.resolutionSteps
  delete legacy.resolutionActionFeedback
  store.set(EVENT_SAVE_KEY, JSON.stringify(legacy))

  const migrated = loadGame(storage, 'event')
  assert.equal(migrated.saveVersion, 6)
  assert.deepEqual(migrated.encounterQueue, EVENT_ASSIGNMENT)
  assert.deepEqual(migrated.resolutionSteps, {})

  const legacyPractice = JSON.parse(JSON.stringify(started(102))) as Record<string, unknown>
  legacyPractice.saveVersion = 4
  delete legacyPractice.resolutionSteps
  delete legacyPractice.resolutionActionFeedback
  store.set(SAVE_KEY, JSON.stringify(legacyPractice))
  const migratedPractice = loadGame(storage, 'practice')
  assert.equal(migratedPractice.saveVersion, 6)
  assert.deepEqual(migratedPractice.encounterQueue, legacyPractice.encounterQueue)
  assert.equal(migratedPractice.runMode, 'practice')
})

test('legacy v5 event saves preserve assigned actions while initializing interaction and corruption state', () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  }
  const legacy = JSON.parse(JSON.stringify(startedEventRun())) as Record<string, unknown>
  legacy.saveVersion = 5
  delete legacy.performedPhoneInteractions
  delete legacy.corruptionByScenario
  store.set(EVENT_SAVE_KEY, JSON.stringify(legacy))

  const migrated = loadGame(storage, 'event')
  assert.equal(migrated.saveVersion, 6)
  assert.deepEqual(migrated.encounterQueue, EVENT_ASSIGNMENT)
  assert.deepEqual(migrated.performedPhoneInteractions, {})
  assert.deepEqual(migrated.corruptionByScenario, {})
})

test('illegal transitions are ignored', () => {
  const menu = initialGameState()
  assert.equal(gameReducer(menu, { type: 'CHOOSE', choiceId: 'MK-A1-c2', now: T0 }), menu)

  const idle = started()
  assert.equal(gameReducer(idle, { type: 'OPEN_DECISION', decisionId: `${currentEncounter(idle)!.id}-D1` }), idle, 'cannot decide before investigating')
  assert.equal(gameReducer(idle, { type: 'INSPECT_ARTIFACT', artifactId: currentEncounter(idle)!.artifacts[0].id, now: T0 }), idle)
  assert.equal(gameReducer(idle, { type: 'NEXT_ENCOUNTER', now: T0 }), idle)
  assert.equal(canDispatch(idle, 'TRIGGER_ENCOUNTER'), true)
  assert.equal(canDispatch(idle, 'CHOOSE'), false)
})

test('an encounter cannot be completed twice', () => {
  let s = decisionReady(started())
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
  assert.equal(clueBonus(1, 3, 0), 3)
  assert.equal(clueBonus(2, 3, 0), 7)
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

test('event ratings match the five-scenario organizer thresholds', () => {
  const expected = ['BLACKED OUT', 'BLACKED OUT', 'CRITICAL', 'PARTIALLY COMPROMISED', 'MOSTLY SECURED', 'FULLY SECURED']
  expected.forEach((rating, correct) => assert.equal(eventSurvivalRating(correct), rating))
})

test('artifacts from another encounter cannot be inspected', () => {
  const s = investigating(started())
  const other = CHARACTERS[0].encounters.find(e => e.id !== currentEncounter(s)!.id)!
  assert.equal(gameReducer(s, { type: 'INSPECT_ARTIFACT', artifactId: other.artifacts[0].id, now: T0 }), s)
})

test('hints are capped and reduce the clue bonus', () => {
  let s = investigating(started())
  const encounter = currentEncounter(s)!
  for (let i = 0; i < 10; i++) s = gameReducer(s, { type: 'USE_HINT', now: T0 })
  assert.equal(s.hintsUsed[encounter.id], encounter.hints.length)
  s = openPending(takeInNarrative(findEvidence(s, T0, false)))
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
  s = investigating(gameReducer(s, { type: 'NEXT_ENCOUNTER', now: T0 + 20000 }))
  saveGame(s, storage)
  assert.deepEqual(loadGame(storage), s)
})

test('refresh restores feedback and results phases without restarting', () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  }

  let s = decisionReady(started(19))
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
  s = openIncident(s, T0)
  assert.equal(nextHintDueAt(s), T0 + 10_000)

  const [first, ...rest] = currentEncounter(s)!.artifacts
  s = gameReducer(s, { type: 'INSPECT_ARTIFACT', artifactId: first.id, now: T0 + 4_000 })
  assert.equal(nextHintDueAt(s), T0 + 14_000, 'finding evidence restarts the clock')

  s = gameReducer(s, { type: 'USE_HINT', now: T0 + 14_000 })
  assert.equal(nextHintDueAt(s), T0 + 24_000, 'next hint 10 s after the last one')

  s = takeInNarrative(s)
  assert.equal(openPending(s).phase, 'DECISION', 'the decision is available while clues remain optional')
  assert.notEqual(nextHintDueAt(s), null, 'so hints keep coming')

  for (const a of rest) s = gameReducer(s, { type: 'INSPECT_ARTIFACT', artifactId: a.id, now: T0 + 25_000 })
  assert.equal(nextHintDueAt(s), null, 'no hints once all key evidence is found')
})

test('hint timer stops when hints run out or the encounter ends', () => {
  let s = investigating(started())
  for (let i = 0; i < 3; i++) s = gameReducer(s, { type: 'USE_HINT', now: T0 + i })
  assert.equal(nextHintDueAt(s), null)
  s = openPending(findEvidence(takeInNarrative(s)))
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
