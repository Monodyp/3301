import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  EVENT_PARTICIPANT_KEY,
  createRegistrationId,
  loadStoredParticipant,
  normalizeNickname,
  normalizeSessionId,
  registrationIdForSession,
  saveStoredParticipant,
  type StoredParticipant,
} from '../src/event/participant.ts'
import { canTransitionSession, isSessionStatus } from '../supabase/functions/_shared/session-rules.ts'
import { initialGameState } from '../src/game/engine.ts'
import { getScenarioDefinition } from '../src/game/scenarioRegistry.ts'
import { participantCompletionTimeMs, participantDecisionRecords, participantRunProgress } from '../src/event/progress.ts'
import type { GameState } from '../src/game/types.ts'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
    clear: () => values.clear(),
    key: index => Array.from(values.keys())[index] ?? null,
    get length() { return values.size },
  }
}

test('session IDs normalize casing and reject malformed values', () => {
  assert.equal(normalizeSessionId('  550E8400-E29B-41D4-A716-446655440000 '), '550e8400-e29b-41d4-a716-446655440000')
  assert.equal(normalizeSessionId('not-a-session'), null)
})

test('nicknames are trimmed, Unicode-aware, and may be identical', () => {
  assert.equal(normalizeNickname('  Kai  '), 'Kai')
  assert.equal(normalizeNickname('Kai'), normalizeNickname('Kai'))
  assert.equal(normalizeNickname('😀'.repeat(32)), '😀'.repeat(32))
  assert.equal(normalizeNickname('😀'.repeat(33)), null)
  assert.equal(normalizeNickname('invalid\nname'), null)
})

test('registration identity is a UUID and survives refresh storage', () => {
  const storage = memoryStorage()
  const participant: StoredParticipant = {
    sessionId: '550e8400-e29b-41d4-a716-446655440000',
    registrationId: createRegistrationId(),
    playerId: 'a49c40d3-3a4b-4bc8-a32a-0146e331c43b',
    nickname: 'Kai',
    sessionName: 'Seminar',
    completionStatus: 'joined',
    eventRunStarted: false,
  }
  assert.match(participant.registrationId, /^[0-9a-f-]{36}$/i)
  saveStoredParticipant(participant, storage)
  assert.deepEqual(loadStoredParticipant(storage), participant)
  assert.notEqual(storage.getItem(EVENT_PARTICIPANT_KEY), null)
})

test('a same-session retry reuses identity and a different session gets a new identity', () => {
  const registrationId = createRegistrationId()
  const existing = {
    sessionId: '550e8400-e29b-41d4-a716-446655440000',
    registrationId,
  }
  assert.equal(registrationIdForSession(existing, existing.sessionId), registrationId)
  assert.notEqual(registrationIdForSession(existing, '650e8400-e29b-41d4-a716-446655440000'), registrationId)
})

test('event status transition rules allow waiting, active, and completed lifecycle only', () => {
  assert.equal(isSessionStatus('waiting'), true)
  assert.equal(isSessionStatus('unknown'), false)
  assert.equal(canTransitionSession('waiting', 'active'), true)
  assert.equal(canTransitionSession('waiting', 'completed'), false)
  assert.equal(canTransitionSession('active', 'completed'), true)
  assert.equal(canTransitionSession('active', 'waiting'), false)
  assert.equal(canTransitionSession('completed', 'active'), false)
})

test('participant progress preserves assignment order and separates evidence, wrong actions, and resolution', () => {
  const scenarioIds = ['RF-R3', 'MK-A1', 'RF-O2', 'MK-R2', 'RF-A1']
  const wrongInteraction = getScenarioDefinition('RF-R3')!.action.interactions.find(item => item.classification === 'incorrect')!
  const state: GameState = {
    ...initialGameState(),
    runMode: 'event',
    eventRunId: 'run-id',
    encounterQueue: scenarioIds,
    currentEncounterIndex: 0,
    phase: 'INVESTIGATION',
    inspectedArtifacts: ['RF-R3-ART-01'],
    performedPhoneInteractions: { 'RF-R3': [wrongInteraction.id] },
    completedEncounters: [],
    decisionHistory: [],
  }

  const progress = participantRunProgress(state)
  assert.deepEqual(progress.scenarioIds, scenarioIds)
  assert.equal(progress.scenarios[0]?.state, 'investigating')
  assert.deepEqual(progress.scenarios[0]?.evidence, ['RF-R3-ART-01'])
  assert.deepEqual(progress.scenarios[0]?.incorrectActions, [wrongInteraction.id])
  assert.ok(progress.actions.some(action =>
    action.scenarioId === 'RF-R3'
    && action.actionId === wrongInteraction.id
    && action.actionKind === 'protective_action'
    && action.correct === false,
  ))
  assert.ok(progress.actions.some(action =>
    action.scenarioId === 'RF-R3'
    && action.actionId === 'evidence:RF-R3-ART-01'
    && action.actionKind === 'evidence',
  ))
})

test('event result submission records follow backend scenario order and completion time', () => {
  const scenarioIds = ['RF-R3', 'MK-A1', 'RF-O2', 'MK-R2', 'RF-A1']
  const decisionHistory = scenarioIds.map(encounterId => ({
    encounterId,
    archetype: 'A1' as const,
    category: 'awareness' as const,
    choiceId: `${encounterId}-c1`,
    correct: true,
    secondsTaken: 12,
    inspectedKeyEvidence: 3,
    totalKeyEvidence: 3,
    hintsUsed: 0,
    score: { base: 100, timeBonus: 25, clueBonus: 10, total: 135 },
  }))
  const state: GameState = {
    ...initialGameState(),
    runMode: 'event',
    eventRunId: 'run-id',
    encounterQueue: scenarioIds,
    decisionHistory,
    runStartedAt: 1000,
    runFinishedAt: 9000,
  }

  assert.deepEqual(participantDecisionRecords(state).map(record => record.scenarioId), scenarioIds)
  assert.equal(participantCompletionTimeMs(state), 8000)
})
