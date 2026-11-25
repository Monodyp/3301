import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

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
  const sessionId = (created.payload.data?.session as { id?: string } | undefined)?.id
  assert.ok(sessionId, 'create must return the new session ID')

  let reset = false
  try {
    const registrations = [randomUUID(), randomUUID()]
    const joined = await Promise.all(registrations.map(registrationId => call('join', {
      sessionId,
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
    const reconnectedParticipant = reconnected.payload.data?.participant as {
      run?: { id: string; scenarioIds: string[] }
    } | undefined
    assert.deepEqual(reconnectedParticipant?.run, firstRun)

    const progress = { completedScenarioCount: 2, checkpoint: 'investigation' }
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
  } finally {
    if (!reset) {
      await call('reset', { sessionId, confirmSessionId: sessionId }, organizerToken)
    }
  }
})
