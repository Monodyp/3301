import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { participantIncidentProgress, summarizeIncidentProgress } from '../src/event/adminProgress.ts'
import { buildSessionLeaderboards } from '../src/event/leaderboards.ts'

test('organizer secret is never exposed as a Vite variable or browser persistent storage', () => {
  const api = readFileSync(new URL('../src/event/api.ts', import.meta.url), 'utf8')
  const supabase = readFileSync(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8')
  const dashboard = readFileSync(new URL('../src/components/admin/OrganizerDashboard.tsx', import.meta.url), 'utf8')
  const edge = readFileSync(new URL('../supabase/functions/session-api/index.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(api, /VITE_ORGANIZER|ORGANIZER_ACCESS_TOKEN/)
  assert.doesNotMatch(supabase, /ORGANIZER_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(dashboard, /ORGANIZER_ACCESS_TOKEN|localStorage/)
  assert.doesNotMatch(api, /localStorage.*organizer|organizer.*localStorage/i)
  assert.match(api, /sessionStorage/)
  assert.match(edge, /requireAdminSession/)
  assert.match(edge, /x-admin-session/)
})

test('admin routes stay server-authorized and include lifecycle operations', () => {
  const edge = readFileSync(new URL('../supabase/functions/session-api/index.ts', import.meta.url), 'utf8')
  for (const action of [
    'admin-login',
    'admin-overview',
    'list-sessions',
    'get-session',
    'create',
    'set-status',
    'reset',
    'delete-session',
    'list-participants',
    'get-participant',
    'get-incident-analytics',
    'get-results',
    'export-results',
  ]) {
    assert.match(edge, new RegExp(`case '${action}'`))
  }
})

test('session deletion is authorized, idempotent archival and preserves join-code history', () => {
  const edge = readFileSync(new URL('../supabase/functions/session-api/index.ts', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../supabase/migrations/20261130000000_archive_event_sessions.sql', import.meta.url), 'utf8')
  const joinCodes = readFileSync(new URL('../supabase/migrations/20261127000001_event_session_join_codes.sql', import.meta.url), 'utf8')
  const dashboard = readFileSync(new URL('../src/components/admin/OrganizerDashboard.tsx', import.meta.url), 'utf8')

  assert.match(edge, /case 'delete-session':\s*await requireAdminSession\(request, client\)\s*return archiveSession\(client, body\)/)
  assert.match(edge, /async function archiveSession[\s\S]*if \(!isUuid\(body\.sessionId\)\) throw apiError\('invalid_session_id', 400\)/)
  assert.match(migration, /status in \('waiting', 'active', 'completed', 'archived'\)/)
  assert.match(migration, /if v_status = 'archived' then\s+return query select p_session_id, true;/)
  assert.match(migration, /where s\.id = p_session_id;/)
  assert.match(migration, /if v_session\.status = 'archived' then\s+raise exception using errcode = '55000', message = 'session_not_open';/)
  assert.match(migration, /prevent_archived_event_session_reopen/)
  assert.doesNotMatch(migration, /delete\s+from\s+public\.event_(sessions|players|participant_runs)/i)
  assert.match(joinCodes, /event_sessions_join_code_key unique \(join_code\)/)
  assert.match(joinCodes, /where session\.join_code = v_code/)
  assert.match(dashboard, /Delete session "\$\{sessionName\}" \(\$\{joinCode\}\)/)
  assert.match(dashboard, /setSelectedSessionId\(''\)[\s\S]*setParticipants\(\[\]\)[\s\S]*await refresh\(\)/)
  assert.match(dashboard, /const activeSessions = sessions\.filter\(session => session\.status !== 'archived'\)/)
  assert.match(dashboard, /viewArchivedResults/)
})

test('dashboard route is dedicated and separate from phone gameplay', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /window\.location\.pathname === '\/admin'/)
  assert.match(app, /<OrganizerDashboard \/>/)
  assert.match(app, /<App \/>/)
})

test('participant incident progress uses only that run and its assigned scenarios', () => {
  const assignments = ['RF-A1', 'RF-A2', 'RF-A3', 'RF-R1', 'RF-R2']
  const progressRows = [
    { run_id: 'player-a-run', scenario_id: 'RF-A1', state: 'resolved', resolution_correct: true, resolved_at: '2026-11-26T01:00:00Z' },
    { run_id: 'player-b-run', scenario_id: 'RF-A1', state: 'investigating', resolution_correct: null, resolved_at: null },
    { run_id: 'player-a-run', scenario_id: 'RF-A2', state: 'investigating', resolution_correct: null, resolved_at: null },
  ]

  const playerA = participantIncidentProgress('player-a-run', assignments, progressRows)
  const playerB = participantIncidentProgress('player-b-run', assignments, progressRows)

  assert.equal(playerA.length, 5)
  assert.deepEqual(playerA.map(incident => incident.scenarioId), assignments)
  assert.equal(playerA[0]?.status, 'resolved')
  assert.equal(playerA[0]?.resolvedAt, '2026-11-26T01:00:00Z')
  assert.equal(playerA[1]?.status, 'in-progress')
  assert.equal(playerA[2]?.status, 'unresolved')
  assert.equal(playerB[0]?.status, 'in-progress')
  assert.equal(playerB[0]?.resolvedAt, null)
  assert.deepEqual(summarizeIncidentProgress([playerA, playerB]), { resolved: 1, total: 10 })
})

test('supporting actions and incorrect or incomplete resolutions do not count as resolved', () => {
  const incidents = participantIncidentProgress('run', ['RF-A1', 'RF-A2', 'RF-A3'], [
    {
      run_id: 'run',
      scenario_id: 'RF-A1',
      state: 'investigating',
      resolution_correct: null,
      resolved_at: null,
      action_kind: 'protective_action',
      correct: true,
    },
    {
      run_id: 'run',
      scenario_id: 'RF-A2',
      state: 'completed',
      resolution_correct: false,
      resolved_at: '2026-11-26T01:00:00Z',
      action_kind: 'incident_resolution',
      correct: false,
    },
    {
      run_id: 'run',
      scenario_id: 'RF-A3',
      state: 'resolved',
      resolution_correct: true,
      resolved_at: null,
    },
  ])

  assert.deepEqual(incidents.map(incident => incident.status), [
    'in-progress',
    'unresolved',
    'in-progress',
  ])
  assert.deepEqual(summarizeIncidentProgress([incidents]), { resolved: 0, total: 3 })
})

test('participant dashboard refreshes persisted incident progress and scopes it to each run', () => {
  const edge = readFileSync(new URL('../supabase/functions/session-api/index.ts', import.meta.url), 'utf8')
  const dashboard = readFileSync(new URL('../src/components/admin/OrganizerDashboard.tsx', import.meta.url), 'utf8')

  assert.match(edge, /\.from\('event_run_scenario_progress'\)\s*\.select\('run_id,scenario_id,state,resolution_correct,delivered_at,started_at,resolved_at,completed_at'\)/)
  assert.match(edge, /incidentProgress: incidentProgress\.filter\(row => row\.run_id === run\.id\)/)
  assert.match(edge, /\.select\('id,session_id,nickname,joined_at,completion_status,completed_at'\)/)
  assert.match(edge, /\.select\('id,player_id,status,progress,started_at,updated_at'\)/)
  assert.match(dashboard, /INCIDENT_REFRESH_INTERVAL_MS = 5_000/)
  assert.match(dashboard, /window\.setInterval\(\(\) => void refresh\(\), refreshInterval\)/)
  assert.match(dashboard, /return \(\) => window\.clearInterval\(interval\)/)
})

const assignedScenarioIds = ['MK-A1', 'MK-A2', 'MK-A3', 'MK-R1', 'MK-R2']

function leaderboardParticipant(input: {
  id: string
  sessionId?: string
  runId: string
  status: string
  score: number
  resolved: number
  startedAt?: string
  completedAt?: string | null
  nickname?: string
}) {
  return {
    id: input.id,
    session_id: input.sessionId ?? 'session-a',
    nickname: input.nickname ?? input.id,
    completed_at: input.completedAt ?? null,
    run: {
      id: input.runId,
      status: input.status,
      started_at: input.startedAt ?? '2026-11-26T10:00:00Z',
      scenarioIds: assignedScenarioIds,
      progress: { totalScore: input.score },
      incidentProgress: assignedScenarioIds.map((scenarioId, index) => ({
        run_id: input.runId,
        scenario_id: scenarioId,
        state: index < input.resolved ? 'resolved' : 'assigned',
        resolution_correct: index < input.resolved ? true : null,
        resolved_at: index < input.resolved ? '2026-11-26T10:01:00Z' : null,
      })),
    },
  }
}

test('score leaderboard uses persisted scores, successful incident counts, session scope, and tied ranks', () => {
  const participants = [
    leaderboardParticipant({ id: 'active-leader', runId: 'run-live', status: 'in_progress', score: 700, resolved: 2 }),
    leaderboardParticipant({
      id: 'player-a',
      runId: 'run-a',
      status: 'completed',
      score: 10,
      resolved: 5,
      completedAt: '2026-11-26T10:10:00Z',
    }),
    leaderboardParticipant({
      id: 'player-b',
      runId: 'run-b',
      status: 'completed',
      score: 0,
      resolved: 5,
      completedAt: '2026-11-26T10:10:00Z',
    }),
    leaderboardParticipant({
      id: 'player-c',
      runId: 'run-c',
      status: 'completed',
      score: 0,
      resolved: 4,
      completedAt: '2026-11-26T10:11:00Z',
    }),
    leaderboardParticipant({
      id: 'player-c-earlier',
      runId: 'run-c-earlier',
      status: 'completed',
      score: 0,
      resolved: 4,
      completedAt: '2026-11-26T10:10:00Z',
    }),
    leaderboardParticipant({
      id: 'player-live-tie',
      runId: 'run-live-tie',
      status: 'in_progress',
      score: 550,
      resolved: 4,
    }),
    leaderboardParticipant({
      id: 'other-session',
      sessionId: 'session-b',
      runId: 'run-other',
      status: 'completed',
      score: 9999,
      resolved: 5,
      completedAt: '2026-11-26T10:02:00Z',
    }),
  ]
  const results = [
    { sessionId: 'session-a', run_id: 'run-a', final_score: 600, correct_resolutions: 5 },
    { sessionId: 'session-a', run_id: 'run-b', final_score: 600, correct_resolutions: 5 },
    { sessionId: 'session-a', run_id: 'run-c', final_score: 600, correct_resolutions: 4 },
    { sessionId: 'session-a', run_id: 'run-c-earlier', final_score: 600, correct_resolutions: 4 },
    { sessionId: 'session-b', run_id: 'run-other', final_score: 9999, correct_resolutions: 5 },
  ]

  const leaderboard = buildSessionLeaderboards('session-a', participants, results)

  assert.equal(leaderboard.totalParticipants, 6)
  assert.equal(leaderboard.completedRuns, 2)
  assert.equal(leaderboard.inProgressParticipants, 2)
  assert.deepEqual(
    leaderboard.highestScore.map(entry => [entry.playerId, entry.score, entry.rank]),
    [
      ['active-leader', 700, 1],
      ['player-a', 600, 2],
      ['player-b', 600, 2],
      ['player-c-earlier', 600, 4],
      ['player-c', 600, 5],
      ['player-live-tie', 550, 6],
    ],
  )
})

test('fastest leaderboard requires five successful assigned incidents and uses server timestamps', () => {
  const participants = [
    leaderboardParticipant({
      id: 'slower',
      runId: 'run-slower',
      status: 'completed',
      score: 0,
      resolved: 5,
      startedAt: '2026-11-26T10:00:00Z',
      completedAt: '2026-11-26T10:03:00Z',
    }),
    leaderboardParticipant({
      id: 'best-score',
      runId: 'run-best-score',
      status: 'completed',
      score: 0,
      resolved: 5,
      startedAt: '2026-11-26T10:00:00Z',
      completedAt: '2026-11-26T10:02:00Z',
    }),
    leaderboardParticipant({
      id: 'same-time-earlier',
      runId: 'run-earlier',
      status: 'completed',
      score: 0,
      resolved: 5,
      startedAt: '2026-11-26T10:00:00Z',
      completedAt: '2026-11-26T10:02:00Z',
    }),
    leaderboardParticipant({
      id: 'same-time-later',
      runId: 'run-later',
      status: 'completed',
      score: 0,
      resolved: 5,
      startedAt: '2026-11-26T10:01:00Z',
      completedAt: '2026-11-26T10:03:00Z',
    }),
    leaderboardParticipant({
      id: 'incorrect-resolution',
      runId: 'run-incorrect',
      status: 'completed',
      score: 0,
      resolved: 4,
      startedAt: '2026-11-26T10:00:00Z',
      completedAt: '2026-11-26T10:01:00Z',
    }),
  ]
  const results = [
    { sessionId: 'session-a', run_id: 'run-slower', final_score: 300, correct_resolutions: 5, completion_time_ms: 1 },
    { sessionId: 'session-a', run_id: 'run-best-score', final_score: 450, correct_resolutions: 5, completion_time_ms: 1 },
    { sessionId: 'session-a', run_id: 'run-earlier', final_score: 400, correct_resolutions: 5, completion_time_ms: 1 },
    { sessionId: 'session-a', run_id: 'run-later', final_score: 400, correct_resolutions: 5, completion_time_ms: 1 },
    { sessionId: 'session-a', run_id: 'run-incorrect', final_score: 999, correct_resolutions: 4, completion_time_ms: 1 },
  ]

  const fastest = buildSessionLeaderboards('session-a', participants, results).fastestCompletion

  assert.deepEqual(
    fastest.map(entry => [entry.playerId, entry.elapsedDurationMs, entry.rank]),
    [
      ['best-score', 120_000, 1],
      ['same-time-earlier', 120_000, 2],
      ['same-time-later', 120_000, 3],
      ['slower', 180_000, 4],
    ],
  )
  assert.equal(fastest[0]?.completedAt, '2026-11-26T10:02:00Z')
})

test('leaderboard timing fields remain server sourced and completed runs cannot be submitted twice', () => {
  const edge = readFileSync(new URL('../supabase/functions/session-api/index.ts', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../supabase/migrations/20261129000000_fix_submit_result_run_id_ambiguity.sql', import.meta.url), 'utf8')
  const dashboard = readFileSync(new URL('../src/components/admin/OrganizerDashboard.tsx', import.meta.url), 'utf8')

  assert.match(edge, /\.select\('id,player_id,status,progress,started_at,updated_at'\)/)
  assert.match(migration, /for update of r/)
  assert.match(migration, /duplicate_five_scenario_result/)
  assert.match(migration, /completed_at = clock_timestamp\(\)/)
  assert.match(dashboard, /getAdminResults\(sessionId\)/)
  assert.match(dashboard, /section === 'leaderboards'/)
  assert.match(dashboard, /Auto-refreshes every 5 seconds/)
})
