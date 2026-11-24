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
