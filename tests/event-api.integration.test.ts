import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

interface ApiResponse {
  data?: Record<string, unknown>
  error?: string
}

const enabled = process.env.RUN_PRIORITY5A_INTEGRATION === '1'

test('Supabase event API allocates and persists concurrent participant runs', {
  skip: !enabled && 'Set RUN_PRIORITY5A_INTEGRATION=1 to use a disposable Supabase project.',
}, async () => {
  const projectUrl = process.env.TEST_SUPABASE_URL
  const publishableKey = process.env.TEST_SUPABASE_PUBLISHABLE_KEY
  const organizerToken = process.env.TEST_ORGANIZER_ACCESS_TOKEN
  assert.ok(projectUrl, 'TEST_SUPABASE_URL is required')
  assert.ok(publishableKey, 'TEST_SUPABASE_PUBLISHABLE_KEY is required')
  assert.ok(organizerToken, 'TEST_ORGANIZER_ACCESS_TOKEN is required')

  const endpoint = `${projectUrl.replace(/\/+$/, '')}/functions/v1/session-api`
  const call = async (action: string, body: Record<string, unknown>, token = publishableKey) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action, ...body }),
    })
    const payload = await response.json() as ApiResponse
    return { response, payload }
  }

  const created = await call('create', {
    name: `Priority 5A integration ${randomUUID()}`,
    maxPlayers: 2,
  }, organizerToken)
  assert.equal(created.response.status, 200, created.payload.error)
  const createdSession = created.payload.data?.session as { id?: string; joinCode?: string } | undefined
  const sessionId = createdSession?.id
  const joinCode = createdSession?.joinCode
  assert.ok(sessionId, 'create must return the new session ID')
  assert.ok(joinCode && /^\d{4}$/.test(joinCode), 'create must return a four-digit join code')

  let reset = false
  try {
    const codePreview = await call('lookup', { joinCode })
    assert.equal(codePreview.response.status, 200, codePreview.payload.error)
    const previewSession = codePreview.payload.data?.session as { id?: string; joinCode?: string } | undefined
    assert.equal(previewSession?.id, sessionId, 'the server resolves a code to the internal session UUID')
    assert.equal(previewSession?.joinCode, joinCode)

    const malformedCode = await call('lookup', { joinCode: '4x21' })
    assert.equal(malformedCode.response.status, 400)
    const malformedJoin = await call('join', {
      joinCode: '4x21',
      registrationId: randomUUID(),
      nickname: 'Malformed',
    })
    assert.equal(malformedJoin.response.status, 400)

    const concurrentCreates = await Promise.all(Array.from({ length: 12 }, (_, index) => call('create', {
      name: `Join code concurrency ${index} ${randomUUID()}`,
      maxPlayers: 1,
    }, organizerToken)))
    const concurrentCodes = concurrentCreates.map(result => {
      assert.equal(result.response.status, 200, result.payload.error)
      return (result.payload.data?.session as { joinCode?: string } | undefined)?.joinCode
    })
    assert.ok(concurrentCodes.every(code => code && /^\d{4}$/.test(code)))
    assert.equal(new Set([joinCode, ...concurrentCodes]).size, concurrentCodes.length + 1)

    let nonexistentCode = ''
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
      if (candidate === joinCode) continue
      const lookup = await call('lookup', { joinCode: candidate })
      if (lookup.response.status === 404) {
        nonexistentCode = candidate
        break
      }
      assert.ok([200, 409].includes(lookup.response.status), lookup.payload.error)
    }
    assert.ok(nonexistentCode, 'an unused four-digit code should be reported unavailable')
    const nonexistentLookup = await call('lookup', { joinCode: nonexistentCode })
    assert.equal(nonexistentLookup.response.status, 404)

    const registrations = [randomUUID(), randomUUID()]
    const joined = await Promise.all(registrations.map(registrationId => call('join', {
      joinCode,
      registrationId,
      nickname: 'Duplicate Nickname',
    })))
    for (const result of joined) assert.equal(result.response.status, 200, result.payload.error)
    const participants = joined.map(result =>
      result.payload.data?.participant as { id?: string } | undefined)
    const [participantOne, participantTwo] = participants
    assert.ok(participantOne?.id)
    assert.ok(participantTwo?.id)
    assert.notEqual(participantOne.id, participantTwo.id)

    const fullSessionJoin = await call('join', {
      joinCode,
      registrationId: randomUUID(),
      nickname: 'Late Participant',
    })
    assert.equal(fullSessionJoin.response.status, 404)

    const activated = await call('set-status', { sessionId, status: 'active' }, organizerToken)
    assert.equal(activated.response.status, 200, activated.payload.error)

    const started = await Promise.all(participants.map((participant, index) => call('start', {
      sessionId,
      playerId: participant?.id,
      registrationId: registrations[index],
    })))
    for (const result of started) assert.equal(result.response.status, 200, result.payload.error)

    const runs = started.map(result => {
      const participant = result.payload.data?.participant as {
        run?: { id: string; scenarioIds: string[] }
      } | undefined
      return participant?.run
    })
    const [firstRun, secondRun] = runs
    assert.ok(firstRun)
    assert.ok(secondRun)
    assert.equal(firstRun.scenarioIds.length, 5)
    assert.equal(new Set(firstRun.scenarioIds).size, 5)
    assert.equal(secondRun.scenarioIds.length, 5)
    assert.equal(new Set(secondRun.scenarioIds).size, 5)
    assert.notEqual([...firstRun.scenarioIds].sort().join(','), [...secondRun.scenarioIds].sort().join(','))

    const repeatedStart = await call('start', {
      sessionId,
      playerId: participants[0]?.id,
      registrationId: registrations[0],
    })
    assert.equal(repeatedStart.response.status, 200, repeatedStart.payload.error)
    const repeatedParticipant = repeatedStart.payload.data?.participant as {
      run?: { id: string; scenarioIds: string[] }
    } | undefined
    assert.deepEqual(repeatedParticipant?.run, firstRun)

    const reconnected = await call('lookup', {
      sessionId,
      playerId: participantOne.id,
      registrationId: registrations[0],
    })
    assert.equal(reconnected.response.status, 200, reconnected.payload.error)
    const uuidLookup = await call('lookup', { sessionId })
    assert.equal(uuidLookup.response.status, 200, uuidLookup.payload.error, 'internal UUID lookups remain supported')
    const reconnectedParticipant = reconnected.payload.data?.participant as {
      run?: { id: string; scenarioIds: string[] }
    } | undefined
    assert.deepEqual(reconnectedParticipant?.run, firstRun)

    const firstScenarioId = firstRun.scenarioIds[0]!
    const progress = {
      schemaVersion: 1,
      scenarioIds: firstRun.scenarioIds,
      currentScenarioId: firstScenarioId,
      phase: 'INVESTIGATION',
      completedScenarioCount: 0,
      totalScore: 0,
      scenarios: firstRun.scenarioIds.map((scenarioId, index) => ({
        scenarioId,
        ordinal: index + 1,
        state: index === 0 ? 'investigating' : 'assigned',
        resolutionCorrect: null,
        evidence: [],
        incorrectActions: index === 0 ? ['simulated-wrong-action'] : [],
        scoreImpact: 0,
      })),
      actions: [{
        scenarioId: firstScenarioId,
        actionId: 'simulated-wrong-action',
        actionKind: 'protective_action',
        correct: false,
      }],
    }
    const saved = await call('save-progress', {
      sessionId,
      playerId: participants[0]?.id,
      registrationId: registrations[0],
      progress,
    })
    assert.equal(saved.response.status, 200, saved.payload.error)
    const refreshed = await call('get-run', {
      sessionId,
      playerId: participants[0]?.id,
      registrationId: registrations[0],
    })
    assert.equal(refreshed.response.status, 200, refreshed.payload.error)
    const refreshedRun = refreshed.payload.data?.run as { progress?: unknown } | undefined
    assert.ok(refreshedRun)
    assert.deepEqual(refreshedRun.progress, progress)

    const submitted = await call('submit-result', {
      sessionId,
      playerId: participants[0]?.id,
      registrationId: registrations[0],
      decisionRecords: firstRun.scenarioIds.map(scenarioId => ({
        scenarioId,
        correct: true,
        secondsTaken: 60,
        inspectedKeyEvidence: 0,
        totalKeyEvidence: 3,
        hintsUsed: 0,
      })),
      completionTimeMs: 12000,
    })
    assert.equal(submitted.response.status, 200, submitted.payload.error)
    const submittedResult = submitted.payload.data?.result as { incorrect_actions?: number } | undefined
    assert.equal(submittedResult?.incorrect_actions, 1, 'leaderboard result includes harmful phone actions')

    const completedRunResponse = await call('get-run', {
      sessionId,
      playerId: participants[0]?.id,
      registrationId: registrations[0],
    })
    const completedRun = completedRunResponse.payload.data?.run as { status?: string } | undefined
    assert.equal(completedRun?.status, 'completed')

    const malformed = await call('get-run', {
      sessionId: 'invalid',
      playerId: participants[0]?.id,
      registrationId: registrations[0],
    })
    assert.equal(malformed.response.status, 400)

    const unauthorizedReset = await call('reset', {
      sessionId,
      confirmSessionId: sessionId,
    })
    assert.equal(unauthorizedReset.response.status, 401)

    const resetResponse = await call('reset', {
      sessionId,
      confirmSessionId: sessionId,
    }, organizerToken)
    assert.equal(resetResponse.response.status, 200, resetResponse.payload.error)
    reset = true
    const resetSummary = resetResponse.payload.data?.session as { status?: string } | undefined
    assert.equal(resetSummary?.status, 'waiting')

    const afterReset = await call('lookup', {
      sessionId,
      playerId: participantOne.id,
      registrationId: registrations[0],
    })
    const resetParticipant = afterReset.payload.data?.participant as {
      completionStatus?: string
      run?: unknown
    } | undefined
    assert.equal(resetParticipant?.completionStatus, 'joined')
    assert.equal(resetParticipant?.run, null)

    const activatedAgain = await call('set-status', { sessionId, status: 'active' }, organizerToken)
    assert.equal(activatedAgain.response.status, 200, activatedAgain.payload.error)
    const completed = await call('set-status', { sessionId, status: 'completed' }, organizerToken)
    assert.equal(completed.response.status, 200, completed.payload.error)
    const completedCodeLookup = await call('lookup', { joinCode })
    assert.equal(completedCodeLookup.response.status, 404)
    const completedCodeJoin = await call('join', {
      joinCode,
      registrationId: randomUUID(),
      nickname: 'Late Joiner',
    })
    assert.equal(completedCodeJoin.response.status, 404)

    const replacement = await call('create', {
      name: `Non-reused join code ${randomUUID()}`,
      maxPlayers: 1,
    }, organizerToken)
    assert.equal(replacement.response.status, 200, replacement.payload.error)
    const replacementCode = (replacement.payload.data?.session as { joinCode?: string } | undefined)?.joinCode
    assert.ok(replacementCode && replacementCode !== joinCode, 'completed session codes are never reissued')
    assert.equal((await call('lookup', { joinCode })).response.status, 404)
  } finally {
    if (!reset) {
      await call('reset', { sessionId, confirmSessionId: sessionId }, organizerToken)
    }
  }
})

test('database join-code limiter is atomic, expires windows, and preserves successful attempts', {
  skip: !enabled && 'Set RUN_PRIORITY5A_INTEGRATION=1 to use a disposable Supabase project.',
}, async () => {
  const projectUrl = process.env.TEST_SUPABASE_URL
  const serviceRoleKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY
  assert.ok(projectUrl, 'TEST_SUPABASE_URL is required')
  assert.ok(serviceRoleKey, 'TEST_SUPABASE_SERVICE_ROLE_KEY is required for database rate-limit tests')

  const client = createClient(projectUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const hash = () => createHash('sha256').update(randomUUID()).digest('hex')
  const begin = async (
    clientHash: string,
    codeHash: string,
    joinCode: string | null,
    now: Date,
  ) => {
    const { data, error } = await client.rpc('record_event_join_code_attempt', {
      p_attempt_id: randomUUID(),
      p_client_hash: clientHash,
      p_code_hash: codeHash,
      p_join_code: joinCode,
      p_now: now.toISOString(),
    })
    assert.ifError(error)
    const result = Array.isArray(data) ? data[0] : data
    assert.ok(result && typeof result === 'object')
    return result as { allowed: boolean; failure_recorded: boolean }
  }

  const baseTime = new Date(Date.now() + 60_000)
  const expiringClient = hash()
  const expiringCode = hash()
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const result = await begin(expiringClient, expiringCode, null, baseTime)
    assert.deepEqual(result, { allowed: true, failure_recorded: true })
  }
  assert.deepEqual(
    await begin(expiringClient, expiringCode, null, baseTime),
    { allowed: false, failure_recorded: false },
    'the eleventh failure for one code is blocked',
  )
  assert.equal((await begin(
    expiringClient,
    expiringCode,
    null,
    new Date(baseTime.getTime() + 14 * 60_000),
  )).allowed, false, 'the 15-minute window remains active')
  assert.equal((await begin(
    expiringClient,
    expiringCode,
    null,
    new Date(baseTime.getTime() + 16 * 60_000),
  )).allowed, true, 'the short window expires')
  assert.equal((await begin(
    expiringClient,
    expiringCode,
    null,
    new Date(baseTime.getTime() + 25 * 60 * 60_000),
  )).allowed, true, 'the 24-hour records expire and are cleaned up')

  const concurrentClient = hash()
  const concurrentCode = hash()
  const simultaneousAttempts = await Promise.all(Array.from({ length: 16 }, () =>
    begin(concurrentClient, concurrentCode, null, baseTime)))
  assert.equal(
    simultaneousAttempts.filter(result => result.allowed).length,
    10,
    'concurrent failures cannot exceed the per-code threshold',
  )

  const ipLimitClient = hash()
  const distinctCodeHashes = await Promise.all(Array.from({ length: 125 }, () =>
    begin(ipLimitClient, hash(), null, new Date(baseTime.getTime() + 30 * 60_000))))
  assert.equal(
    distinctCodeHashes.filter(result => result.allowed).length,
    120,
    'concurrent failures cannot exceed the per-client threshold',
  )

  const { data: session, error: sessionError } = await client
    .from('event_sessions')
    .insert({ name: `Rate limit success ${randomUUID()}`, max_players: 1 })
    .select('join_code')
    .single()
  assert.ifError(sessionError)
  assert.ok(session?.join_code)
  const successfulCodeHash = hash()
  const successfulJoin = await begin(
    hash(),
    successfulCodeHash,
    session.join_code,
    new Date(baseTime.getTime() + 60 * 60_000),
  )
  assert.deepEqual(successfulJoin, { allowed: true, failure_recorded: false })
})

test('public code API limits failed lookups and joins without charging successful joins', {
  skip: !enabled && 'Set RUN_PRIORITY5A_INTEGRATION=1 to use a disposable Supabase project.',
}, async () => {
  const projectUrl = process.env.TEST_SUPABASE_URL
  const publishableKey = process.env.TEST_SUPABASE_PUBLISHABLE_KEY
  const organizerToken = process.env.TEST_ORGANIZER_ACCESS_TOKEN
  assert.ok(projectUrl, 'TEST_SUPABASE_URL is required')
  assert.ok(publishableKey, 'TEST_SUPABASE_PUBLISHABLE_KEY is required')
  assert.ok(organizerToken, 'TEST_ORGANIZER_ACCESS_TOKEN is required')

  const endpoint = `${projectUrl.replace(/\/+$/, '')}/functions/v1/session-api`
  const call = async (action: string, body: Record<string, unknown>, token = publishableKey) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action, ...body }),
    })
    const payload = await response.json() as ApiResponse
    return { response, payload }
  }

  const created = await call('create', {
    name: `Join limiter integration ${randomUUID()}`,
    maxPlayers: 2,
  }, organizerToken)
  assert.equal(created.response.status, 200, created.payload.error)
  const session = created.payload.data?.session as { id?: string; joinCode?: string } | undefined
  assert.ok(session?.id)
  assert.ok(session?.joinCode)

  try {
    const successfulLookups = await Promise.all(Array.from({ length: 12 }, () =>
      call('lookup', { joinCode: session.joinCode })))
    for (const result of successfulLookups) {
      assert.equal(result.response.status, 200, result.payload.error)
    }

    const firstJoin = await call('join', {
      joinCode: session.joinCode,
      registrationId: randomUUID(),
      nickname: 'Legitimate Player One',
    })
    assert.equal(firstJoin.response.status, 200, firstJoin.payload.error)

    let unavailableCode = ''
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
      if (candidate === session.joinCode) continue
      const lookup = await call('lookup', { joinCode: candidate })
      if (lookup.response.status === 404) {
        unavailableCode = candidate
        break
      }
      assert.equal(lookup.response.status, 200, lookup.payload.error)
    }
    assert.ok(unavailableCode, 'an unavailable code should be found for the limiter test')

    for (let attempt = 1; attempt < 10; attempt += 1) {
      const lookup = await call('lookup', { joinCode: unavailableCode })
      assert.equal(lookup.response.status, 404, lookup.payload.error)
    }
    const limitedLookup = await call('lookup', { joinCode: unavailableCode })
    assert.equal(limitedLookup.response.status, 429)
    assert.equal(limitedLookup.payload.error, 'join_temporarily_unavailable')

    const limitedJoin = await call('join', {
      joinCode: unavailableCode,
      registrationId: randomUUID(),
      nickname: 'Blocked Guess',
    })
    assert.equal(limitedJoin.response.status, 429)
    assert.equal(limitedJoin.payload.error, limitedLookup.payload.error)

    const secondJoin = await call('join', {
      joinCode: session.joinCode,
      registrationId: randomUUID(),
      nickname: 'Legitimate Player Two',
    })
    assert.equal(secondJoin.response.status, 200, secondJoin.payload.error)
  } finally {
    await call('reset', {
      sessionId: session.id,
      confirmSessionId: session.id,
    }, organizerToken)
  }
})
