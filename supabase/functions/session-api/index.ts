import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { canTransitionSession, isSessionStatus, type SessionStatus } from '../_shared/session-rules.ts'

interface ApiError extends Error {
  status: number
  code: string
}

let adminClient: SupabaseClient | undefined
let joinRateLimitHmacKey: CryptoKey | undefined

function apiError(code: string, status: number): ApiError {
  return Object.assign(new Error(code), { code, status })
}

function getAdminClient(): SupabaseClient {
  if (adminClient) return adminClient
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) throw apiError('server_not_configured', 503)
  adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return adminClient
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isJoinCode(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}$/.test(value)
}

function cleanText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string') return null
  const result = value.trim()
  const characters = Array.from(result)
  if (characters.length < min || characters.length > max || characters.some(isControlCharacter)) return null
  return result
}

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0
  return codePoint <= 0x1f || codePoint === 0x7f
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left)
  const rightBytes = new TextEncoder().encode(right)
  let difference = leftBytes.length ^ rightBytes.length
  const length = Math.max(leftBytes.length, rightBytes.length)
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0)
  }
  return difference === 0
}

function requireOrganizer(request: Request): void {
  const expected = Deno.env.get('ORGANIZER_ACCESS_TOKEN')
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!expected || expected.length < 32) throw apiError('organizer_not_configured', 503)
  if (!supplied || !safeEqual(supplied, expected)) {
    throw apiError('organizer_unauthorized', 401)
  }
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

function getClientIp(request: Request): string {
  // Supabase's gateway supplies the observed client address as the first forwarded value.
  const forwardedFor = request.headers.get('x-forwarded-for')
  const candidate = forwardedFor?.split(',')[0]?.trim()
  if (!candidate || candidate.length > 64 || candidate.includes('%')) {
    throw apiError('client_ip_unavailable', 503)
  }

  const ipv4Octets = candidate.split('.')
  if (ipv4Octets.length === 4 && ipv4Octets.every(octet => /^\d{1,3}$/.test(octet))) {
    const values = ipv4Octets.map(Number)
    if (values.every(value => value >= 0 && value <= 255)) {
      return values.join('.')
    }
  }

  try {
    const parsed = new URL(`http://[${candidate}]/`)
    if (parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')) {
      return parsed.hostname.toLowerCase()
    }
  } catch {
    throw apiError('client_ip_unavailable', 503)
  }

  throw apiError('client_ip_unavailable', 503)
}

async function getJoinRateLimitHmacKey(): Promise<CryptoKey> {
  if (joinRateLimitHmacKey) return joinRateLimitHmacKey

  const secret = Deno.env.get('JOIN_RATE_LIMIT_HMAC_KEY')
  if (!secret || !/^[0-9a-f]{64}$/i.test(secret)) {
    throw apiError('join_rate_limiter_unavailable', 503)
  }
  const keyBytes = new Uint8Array(secret.match(/.{2}/g)!.map(byte => Number.parseInt(byte, 16)))
  joinRateLimitHmacKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return joinRateLimitHmacKey
}

async function hmacIdentifier(key: CryptoKey, namespace: string, value: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${namespace}:${value}`)
  const digest = await crypto.subtle.sign('HMAC', key, bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function recordJoinCodeAttempt(
  client: SupabaseClient,
  attemptId: string,
  clientHash: string,
  codeHash: string,
  joinCode: string | null,
): Promise<{ allowed: boolean; failureRecorded: boolean }> {
  const { data, error } = await client.rpc('record_event_join_code_attempt', {
    p_attempt_id: attemptId,
    p_client_hash: clientHash,
    p_code_hash: codeHash,
    p_join_code: joinCode,
  })
  if (error) throw apiError('join_rate_limiter_unavailable', 503)
  const result = Array.isArray(data) ? data[0] : data
  if (!isRecord(result)
    || typeof result.allowed !== 'boolean'
    || typeof result.failure_recorded !== 'boolean') {
    throw apiError('join_rate_limiter_unavailable', 503)
  }
  return { allowed: result.allowed, failureRecorded: result.failure_recorded }
}

function isPublicJoinCodeAttempt(body: Record<string, unknown>): boolean {
  return body.action === 'join'
    || (body.action === 'lookup' && body.joinCode !== undefined)
}

function isFailedJoinCodeAttempt(error: unknown): boolean {
  return isRecord(error)
    && typeof error.status === 'number'
    && error.status >= 400
    && error.status < 500
}

function hideJoinCodeAvailability(error: unknown): unknown {
  if (!isRecord(error) || typeof error.code !== 'string') return error
  if ([
    'session_code_unavailable',
    'session_not_found',
    'session_not_open',
    'session_full',
  ].includes(error.code)) {
    return apiError('session_code_unavailable', 404)
  }
  return error
}

async function handleRateLimitedJoinCodeAttempt(
  request: Request,
  body: Record<string, unknown>,
): Promise<unknown> {
  const client = getAdminClient()
  const ip = getClientIp(request)
  const key = await getJoinRateLimitHmacKey()
  const codeValue = isJoinCode(body.joinCode) ? body.joinCode : '<invalid-code>'
  const [clientHash, codeHash] = await Promise.all([
    hmacIdentifier(key, 'client-ip', ip),
    hmacIdentifier(key, 'join-code', codeValue),
  ])
  const attemptId = crypto.randomUUID()
  const joinCode = isJoinCode(body.joinCode) ? body.joinCode : null
  let rateLimit = await recordJoinCodeAttempt(client, attemptId, clientHash, codeHash, joinCode)
  if (!rateLimit.allowed) throw apiError('join_temporarily_unavailable', 429)

  let result: unknown
  try {
    result = await handleAction(request, body)
  } catch (error) {
    if (isFailedJoinCodeAttempt(error) && !rateLimit.failureRecorded) {
      rateLimit = await recordJoinCodeAttempt(client, attemptId, clientHash, codeHash, joinCode)
      if (!rateLimit.allowed) throw apiError('join_temporarily_unavailable', 429)
    }
    throw hideJoinCodeAvailability(error)
  }
  return result
}

async function requireAdminSession(request: Request, client: SupabaseClient): Promise<void> {
  const supplied = request.headers.get('x-admin-session')
    ?? request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!supplied) throw apiError('admin_unauthorized', 401)
  const hash = await sha256(supplied)
  const { data, error } = await client
    .from('event_admin_sessions')
    .select('id, expires_at, revoked_at')
    .eq('session_token_hash', hash)
    .maybeSingle()
  if (error) throw mapDatabaseError(error.message)
  if (!data
    || data.revoked_at
    || new Date(String(data.expires_at)).getTime() <= Date.now()) {
    throw apiError('admin_unauthorized', 401)
  }
}

async function setAdminSession(request: Request, client: SupabaseClient) {
  const organizerToken = Deno.env.get('ORGANIZER_ACCESS_TOKEN')
  if (!organizerToken || organizerToken.length < 32) {
    throw apiError('organizer_not_configured', 503)
  }
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!supplied || !safeEqual(supplied, organizerToken)) {
    throw apiError('admin_unauthorized', 401)
  }
  const token = `${crypto.randomUUID()}-${crypto.randomUUID()}`
  const hash = await sha256(token)
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
  const { error } = await client
    .from('event_admin_sessions')
    .insert({ session_token_hash: hash, expires_at: expiresAt })
  if (error) throw mapDatabaseError(error.message)
  return { sessionToken: token, expiresAt }
}

function mapDatabaseError(message: string): ApiError {
  const value = message.toLowerCase()
  if (value.includes('session_not_found')) return apiError('session_not_found', 404)
  if (value.includes('player_not_found')) return apiError('player_not_found', 404)
  if (value.includes('invalid_registration')) return apiError('invalid_registration', 400)
  if (value.includes('organizer_not_configured')) return apiError('organizer_not_configured', 503)
  if (value.includes('session_full')) return apiError('session_full', 409)
  if (value.includes('session_not_open')) return apiError('session_not_open', 409)
  if (value.includes('session_not_active')) return apiError('session_not_active', 409)
  if (value.includes('join_code_space_exhausted')) return apiError('join_code_space_exhausted', 503)
  if (value.includes('join_code_immutable') || value.includes('join_code_managed')) {
    return apiError('database_operation_failed', 500)
  }
  if (value.includes('invalid_status_transition')) return apiError('invalid_status_transition', 409)
  if (value.includes('invalid_session_update')) return apiError('invalid_session_update', 400)
  if (value.includes('player_completed')) return apiError('player_completed', 409)
  if (value.includes('invalid_run_progress')) return apiError('invalid_run_progress', 400)
  if (value.includes('run_not_found')) return apiError('run_not_found', 404)
  if (value.includes('scenario_pool_unavailable')) return apiError('scenario_pool_unavailable', 503)
  if (value.includes('admin_unauthorized')) return apiError('admin_unauthorized', 401)
  if (value.includes('invalid_five_scenario_result')) return apiError('invalid_five_scenario_result', 400)
  if (value.includes('invalid_decision_record')) return apiError('invalid_decision_record', 400)
  if (value.includes('duplicate_decision_scenario')) return apiError('duplicate_decision_scenario', 400)
  if (value.includes('duplicate_five_scenario_result')) return apiError('duplicate_five_scenario_result', 409)
  if (value.includes('admin_unauthorized')) return apiError('admin_unauthorized', 401)
  return apiError('database_operation_failed', 500)
}

function sessionSummary(
  session: { id: string; join_code: string; name: string; status: SessionStatus; max_players: number },
  playerCount: number,
) {
  return {
    id: session.id,
    joinCode: session.join_code,
    name: session.name,
    status: session.status,
    playerCount,
    maxPlayers: session.max_players,
  }
}

async function getSessionSummary(client: SupabaseClient, sessionId: string) {
  const { data: session, error } = await client
    .from('event_sessions')
    .select('id, join_code, name, status, max_players')
    .eq('id', sessionId)
    .maybeSingle()
  if (error) throw mapDatabaseError(error.message)
  if (!session) throw apiError('session_not_found', 404)

  const { count, error: countError } = await client
    .from('event_players')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
  if (countError) throw mapDatabaseError(countError.message)
  return sessionSummary(session, count ?? 0)
}

async function getJoinableSessionByCode(client: SupabaseClient, joinCode: string) {
  const { data: session, error } = await client
    .from('event_sessions')
    .select('id')
    .eq('join_code', joinCode)
    .maybeSingle()
  if (error) throw mapDatabaseError(error.message)
  if (!session) throw apiError('session_code_unavailable', 404)

  const summary = await getSessionSummary(client, session.id)
  if (summary.status !== 'waiting') throw apiError('session_not_open', 409)
  if (summary.playerCount >= summary.maxPlayers) throw apiError('session_full', 409)
  return session
}

async function getParticipantRun(client: SupabaseClient, sessionId: string, playerId: string) {
  const { data: run, error } = await client
    .from('event_participant_runs')
    .select('id, status, progress, updated_at')
    .eq('session_id', sessionId)
    .eq('player_id', playerId)
    .maybeSingle()
  if (error) throw mapDatabaseError(error.message)
  if (!run) return null

  const { data: assignments, error: assignmentError } = await client
    .from('event_run_scenarios')
    .select('scenario_id, ordinal')
    .eq('run_id', run.id)
    .order('ordinal')
  if (assignmentError) throw mapDatabaseError(assignmentError.message)
  if (!assignments || assignments.length !== 5
    || new Set(assignments.map(assignment => assignment.scenario_id)).size !== 5) {
    throw apiError('run_assignment_invalid', 500)
  }

  return {
    id: run.id,
    status: run.status,
    scenarioIds: assignments.map(assignment => assignment.scenario_id),
    progress: run.progress,
    updatedAt: run.updated_at,
  }
}

async function lookupSession(client: SupabaseClient, body: Record<string, unknown>) {
  if (body.joinCode !== undefined) {
    if (!isJoinCode(body.joinCode)) throw apiError('invalid_join_code', 400)
    const session = await getJoinableSessionByCode(client, body.joinCode)
    return { session: await getSessionSummary(client, session.id) }
  }
  if (!isUuid(body.sessionId)) throw apiError('invalid_session_id', 400)
  const session = await getSessionSummary(client, body.sessionId)
  const response: Record<string, unknown> = { session }

  if (body.playerId !== undefined || body.registrationId !== undefined) {
    if (!isUuid(body.playerId) || !isUuid(body.registrationId)) {
      throw apiError('invalid_participant_identity', 400)
    }
    const { data: player, error } = await client
      .from('event_players')
      .select('id, nickname, completion_status')
      .eq('session_id', body.sessionId)
      .eq('id', body.playerId)
      .eq('registration_id', body.registrationId)
      .maybeSingle()
    if (error) throw mapDatabaseError(error.message)
    if (!player) throw apiError('player_not_found', 404)
    response.participant = {
      id: player.id,
      nickname: player.nickname,
      completionStatus: player.completion_status,
      run: await getParticipantRun(client, body.sessionId, player.id),
    }
  }
  return response
}

async function joinSession(client: SupabaseClient, body: Record<string, unknown>) {
  const joinCode = body.joinCode
  const registrationId = body.registrationId
  const nickname = cleanText(body.nickname, 1, 32)
  if (!isJoinCode(joinCode)) throw apiError('invalid_join_code', 400)
  if (!isUuid(registrationId) || !nickname) throw apiError('invalid_registration', 400)
  const resolvedSession = await getJoinableSessionByCode(client, joinCode)
  const sessionId = resolvedSession.id

  const { data, error } = await client.rpc('register_event_player', {
    p_session_id: sessionId,
    p_registration_id: registrationId,
    p_nickname: nickname,
  })
  if (error) throw mapDatabaseError(error.message)
  const player = Array.isArray(data) ? data[0] : data
  if (!player) throw apiError('database_operation_failed', 500)
  const session = await getSessionSummary(client, sessionId)
  return {
    session,
    participant: {
      id: player.player_id,
      nickname: player.player_nickname,
      completionStatus: player.completion_status,
      run: null,
    },
    created: player.created,
  }
}

async function startParticipant(client: SupabaseClient, body: Record<string, unknown>) {
  if (!isUuid(body.sessionId) || !isUuid(body.playerId) || !isUuid(body.registrationId)) {
    throw apiError('invalid_participant_identity', 400)
  }
  const { data, error } = await client.rpc('start_event_player', {
    p_session_id: body.sessionId,
    p_player_id: body.playerId,
    p_registration_id: body.registrationId,
  })
  if (error) throw mapDatabaseError(error.message)
  const player = Array.isArray(data) ? data[0] : data
  if (!player) throw apiError('database_operation_failed', 500)
  const run = await getParticipantRun(client, body.sessionId, body.playerId)
  if (!run) throw apiError('run_not_found', 404)
  return {
    participant: {
      id: player.result_player_id,
      completionStatus: player.result_completion_status,
      run,
    },
    session: await getSessionSummary(client, body.sessionId),
  }
}

async function getRun(client: SupabaseClient, body: Record<string, unknown>) {
  if (!isUuid(body.sessionId) || !isUuid(body.playerId) || !isUuid(body.registrationId)) {
    throw apiError('invalid_participant_identity', 400)
  }
  const { data: player, error } = await client
    .from('event_players')
    .select('id')
    .eq('session_id', body.sessionId)
    .eq('id', body.playerId)
    .eq('registration_id', body.registrationId)
    .maybeSingle()
  if (error) throw mapDatabaseError(error.message)
  if (!player) throw apiError('player_not_found', 404)

  const run = await getParticipantRun(client, body.sessionId, body.playerId)
  if (!run) throw apiError('run_not_found', 404)
  return { run }
}

async function saveRunProgress(client: SupabaseClient, body: Record<string, unknown>) {
  if (!isUuid(body.sessionId) || !isUuid(body.playerId) || !isUuid(body.registrationId)) {
    throw apiError('invalid_participant_identity', 400)
  }
  if (!isRecord(body.progress)) throw apiError('invalid_run_progress', 400)
  const serialized = JSON.stringify(body.progress)
  if (new TextEncoder().encode(serialized).length > 65536) {
    throw apiError('invalid_run_progress', 400)
  }

  const progress = body.progress
  const run = await getParticipantRun(client, body.sessionId, body.playerId)
  if (!run || !Array.isArray(progress.scenarioIds)
    || progress.scenarioIds.length !== 5
    || progress.scenarioIds.some((id, index) => id !== run.scenarioIds[index])) {
    throw apiError('invalid_run_progress', 400)
  }
  if (!Array.isArray(progress.scenarios) || progress.scenarios.length !== 5
    || !Array.isArray(progress.actions) || progress.actions.length > 500) {
    throw apiError('invalid_run_progress', 400)
  }

  const scenarioIds = new Set(run.scenarioIds)
  const scenarioStates = new Set(['assigned', 'delivered', 'investigating', 'resolved', 'completed'])
  const actionKinds = new Set(['evidence', 'protective_action', 'incident_resolution', 'scenario_complete'])
  const scenarioRows = new Map<string, {
    scenarioId: string
    ordinal: number
    state: string
    resolutionCorrect: boolean | null
    evidence: string[]
    incorrectActions: string[]
    scoreImpact: number
  }>()
  for (const [index, raw] of progress.scenarios.entries()) {
    if (!isRecord(raw)
      || typeof raw.scenarioId !== 'string'
      || raw.scenarioId !== run.scenarioIds[index]
      || raw.ordinal !== index + 1
      || typeof raw.state !== 'string'
      || !scenarioStates.has(raw.state)
      || !(raw.resolutionCorrect === null || typeof raw.resolutionCorrect === 'boolean')
      || !Array.isArray(raw.evidence)
      || !raw.evidence.every(id => typeof id === 'string' && id.startsWith(`${raw.scenarioId}-ART-`))
      || !Array.isArray(raw.incorrectActions)
      || !raw.incorrectActions.every(id => typeof id === 'string' && id.length <= 120)
      || typeof raw.scoreImpact !== 'number'
      || !Number.isInteger(raw.scoreImpact)
      || raw.scoreImpact < 0
      || raw.scoreImpact > 135) {
      throw apiError('invalid_run_progress', 400)
    }
    scenarioRows.set(raw.scenarioId, {
      scenarioId: raw.scenarioId,
      ordinal: raw.ordinal,
      state: raw.state,
      resolutionCorrect: raw.resolutionCorrect,
      evidence: raw.evidence,
      incorrectActions: raw.incorrectActions,
      scoreImpact: raw.scoreImpact,
    })
  }

  const actionIds = new Set<string>()
  const actionRows: Array<{
    run_id: string
    scenario_id: string
    action_id: string
    action_kind: string
    correct: boolean | null
  }> = []
  for (const raw of progress.actions) {
    if (!isRecord(raw)
      || typeof raw.scenarioId !== 'string'
      || !scenarioIds.has(raw.scenarioId)
      || typeof raw.actionId !== 'string'
      || raw.actionId.trim().length === 0
      || raw.actionId.length > 120
      || actionIds.has(raw.actionId)
      || typeof raw.actionKind !== 'string'
      || !actionKinds.has(raw.actionKind)
      || !(raw.correct === null || typeof raw.correct === 'boolean')) {
      throw apiError('invalid_run_progress', 400)
    }
    actionIds.add(raw.actionId)
    actionRows.push({
      run_id: run.id,
      scenario_id: raw.scenarioId,
      action_id: raw.actionId,
      action_kind: raw.actionKind,
      correct: raw.correct,
    })
  }

  for (const scenario of scenarioRows.values()) {
    const recordedEvidence = actionRows
      .filter(action => action.scenario_id === scenario.scenarioId && action.action_kind === 'evidence')
      .map(action => action.action_id.slice('evidence:'.length))
    const recordedIncorrectActions = actionRows
      .filter(action => action.scenario_id === scenario.scenarioId
        && action.action_kind === 'protective_action'
        && action.correct === false)
      .map(action => action.action_id)
    if (recordedEvidence.length !== scenario.evidence.length
      || scenario.evidence.some(id => !recordedEvidence.includes(id))
      || recordedIncorrectActions.length !== scenario.incorrectActions.length
      || scenario.incorrectActions.some(id => !recordedIncorrectActions.includes(id))) {
      throw apiError('invalid_run_progress', 400)
    }
  }

  const { data, error } = await client.rpc('save_event_run_progress', {
    p_session_id: body.sessionId,
    p_player_id: body.playerId,
    p_registration_id: body.registrationId,
    p_progress: body.progress,
  })
  if (error) throw mapDatabaseError(error.message)

  const { data: existingRows, error: existingError } = await client
    .from('event_run_scenario_progress')
    .select('scenario_id,state,resolution_correct,evidence,incorrect_actions,score_impact,delivered_at,started_at,resolved_at,completed_at')
    .eq('run_id', run.id)
  if (existingError) throw mapDatabaseError(existingError.message)

  const currentByScenario = new Map((existingRows ?? []).map(row => [row.scenario_id, row]))
  const stateRank: Record<string, number> = {
    assigned: 0,
    delivered: 1,
    investigating: 2,
    resolved: 3,
    completed: 4,
  }
  const now = new Date().toISOString()
  const normalizedProgressRows = [...scenarioRows.values()].map(scenario => {
    const existing = currentByScenario.get(scenario.scenarioId)
    const state = existing && stateRank[existing.state] > stateRank[scenario.state]
      ? existing.state
      : scenario.state
    const evidence = [...new Set([...(existing?.evidence ?? []), ...scenario.evidence])]
    const incorrectActions = [...new Set([...(existing?.incorrect_actions ?? []), ...scenario.incorrectActions])]
    return {
      run_id: run.id,
      scenario_id: scenario.scenarioId,
      ordinal: scenario.ordinal,
      state,
      resolution_correct: existing?.resolution_correct ?? scenario.resolutionCorrect,
      evidence,
      incorrect_actions: incorrectActions,
      score_impact: Math.max(existing?.score_impact ?? 0, scenario.scoreImpact),
      delivered_at: existing?.delivered_at ?? (state !== 'assigned' ? now : null),
      started_at: existing?.started_at ?? (['investigating', 'resolved', 'completed'].includes(state) ? now : null),
      resolved_at: existing?.resolved_at ?? (['resolved', 'completed'].includes(state) ? now : null),
      completed_at: existing?.completed_at ?? (state === 'completed' ? now : null),
      updated_at: now,
    }
  })
  const { error: progressWriteError } = await client
    .from('event_run_scenario_progress')
    .upsert(normalizedProgressRows, { onConflict: 'run_id,scenario_id' })
  if (progressWriteError) throw mapDatabaseError(progressWriteError.message)

  if (actionRows.length > 0) {
    const { error: actionWriteError } = await client
      .from('event_run_action_records')
      .upsert(actionRows, { onConflict: 'run_id,action_id', ignoreDuplicates: true })
    if (actionWriteError) throw mapDatabaseError(actionWriteError.message)
  }
  return { saved: true, updatedAt: data }
}

async function createSession(client: SupabaseClient, body: Record<string, unknown>) {
  const name = cleanText(body.name, 1, 120)
  if (!name) throw apiError('invalid_session_name', 400)
  const maxPlayers = body.maxPlayers === undefined ? 60 : body.maxPlayers
  if (typeof maxPlayers !== 'number' || !Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 200) {
    throw apiError('invalid_capacity', 400)
  }

  const { data, error } = await client
    .from('event_sessions')
    .insert({ name, max_players: maxPlayers })
    .select('id, join_code, name, status, max_players')
    .single()
  if (error) throw mapDatabaseError(error.message)
  return { session: sessionSummary(data, 0) }
}

async function updateSessionStatus(client: SupabaseClient, body: Record<string, unknown>) {
  if (!isUuid(body.sessionId) || !isSessionStatus(body.status) || body.status === 'waiting') {
    throw apiError('invalid_session_update', 400)
  }
  const nextStatus: SessionStatus = body.status
  const { data: current, error: lookupError } = await client
    .from('event_sessions')
    .select('id, name, status, max_players')
    .eq('id', body.sessionId)
    .maybeSingle()
  if (lookupError) throw mapDatabaseError(lookupError.message)
  if (!current) throw apiError('session_not_found', 404)
  if (current.status === nextStatus) {
    return { session: await getSessionSummary(client, body.sessionId) }
  }
  if (!canTransitionSession(current.status, nextStatus)) {
    throw apiError('invalid_status_transition', 409)
  }

  const { data, error } = await client.rpc('set_event_session_status', {
    p_session_id: body.sessionId,
    p_next_status: nextStatus,
  })
  if (error) throw mapDatabaseError(error.message)
  const updated = Array.isArray(data) ? data[0] : data
  if (!updated) throw apiError('database_operation_failed', 500)
  return { session: await getSessionSummary(client, body.sessionId) }
}

async function resetSession(client: SupabaseClient, body: Record<string, unknown>) {
  if (!isUuid(body.sessionId)) throw apiError('invalid_session_id', 400)
  if (body.confirmSessionId !== body.sessionId) throw apiError('invalid_reset_confirmation', 400)

  const { data, error } = await client.rpc('reset_event_session', {
    p_session_id: body.sessionId,
  })
  if (error) throw mapDatabaseError(error.message)
  if (!data || (Array.isArray(data) && data.length === 0)) {
    throw apiError('database_operation_failed', 500)
  }
  return { session: await getSessionSummary(client, body.sessionId), reset: true }
}

async function revokeAdminSession(request: Request, client: SupabaseClient) {
  await requireAdminSession(request, client)
  const supplied = request.headers.get('x-admin-session')
    ?? request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (supplied) {
    const hash = await sha256(supplied)
    await client
      .from('event_admin_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('session_token_hash', hash)
  }
  return { loggedOut: true }
}

async function adminOverview(client: SupabaseClient) {
  const [sessions, players, inProgress, completed, results] = await Promise.all([
    client.from('event_sessions').select('id,status', { count: 'exact' }),
    client.from('event_players').select('id', { count: 'exact' }),
    client.from('event_players').select('id', { count: 'exact' }).eq('completion_status', 'in_progress'),
    client.from('event_players').select('id', { count: 'exact' }).eq('completion_status', 'completed'),
    client.from('event_run_five_scenario_results').select('final_score'),
  ])
  for (const query of [sessions, players, inProgress, completed, results]) {
    if (query.error) throw mapDatabaseError(query.error.message)
  }
  const sessionRows = (sessions.data ?? []) as Array<{ status: string }>
  const scoreRows = (results.data ?? []) as Array<{ final_score: number }>
  const waiting = sessionRows.filter(row => row.status === 'waiting').length
  const active = sessionRows.filter(row => row.status === 'active').length
  const completedSessions = sessionRows.filter(row => row.status === 'completed').length
  const averageScore = scoreRows.length
    ? scoreRows.reduce((sum, row) => sum + row.final_score, 0) / scoreRows.length
    : null

  const { data: progressRows, error: progressError } = await client
    .from('event_run_scenario_progress')
    .select('state')
  if (progressError) throw mapDatabaseError(progressError.message)
  const states = (progressRows ?? []) as Array<{ state: string }>
  return {
    totalSessions: sessions.count ?? 0,
    waitingSessions: waiting,
    activeSessions: active,
    completedSessions,
    totalParticipants: players.count ?? 0,
    participantsInProgress: inProgress.count ?? 0,
    participantsCompleted: completed.count ?? 0,
    averageParticipantScore: averageScore,
    incidentStats: {
      assigned: states.filter(row => row.state !== 'assigned').length,
      started: states.filter(row => ['investigating', 'resolved', 'completed'].includes(row.state)).length,
      completed: states.filter(row => row.state === 'completed').length,
      resolved: states.filter(row => ['resolved', 'completed'].includes(row.state)).length,
    },
  }
}

async function listSessions(client: SupabaseClient) {
  const { data, error } = await client
    .from('event_sessions')
    .select('id,join_code,name,status,created_at,started_at,ended_at,max_players')
    .order('created_at', { ascending: false })
  if (error) throw mapDatabaseError(error.message)
  const sessions = data ?? []
  const ids = sessions.map(session => session.id)
  if (ids.length === 0) return { sessions: [] }
  const { data: players, error: playerError } = await client
    .from('event_players')
    .select('session_id,completion_status')
    .in('session_id', ids)
  if (playerError) throw mapDatabaseError(playerError.message)
  const playerRows = players ?? []
  return {
    sessions: sessions.map(session => ({
      ...session,
      participantCount: playerRows.filter(player => player.session_id === session.id).length,
      completionCount: playerRows.filter(player =>
        player.session_id === session.id && player.completion_status === 'completed').length,
    })),
  }
}

async function getSession(client: SupabaseClient, body: Record<string, unknown>) {
  if (!isUuid(body.sessionId)) throw apiError('invalid_session_id', 400)
  const session = await getSessionSummary(client, body.sessionId)
  const { data: players, error } = await client
    .from('event_players')
    .select('id,nickname,joined_at,completion_status,completed_at')
    .eq('session_id', body.sessionId)
    .order('joined_at')
  if (error) throw mapDatabaseError(error.message)
  const playerIds = (players ?? []).map(player => player.id)
  let runs: Array<Record<string, unknown>> = []
  if (playerIds.length > 0) {
    const { data: runRows, error: runError } = await client
      .from('event_participant_runs')
      .select('id,player_id,status,progress,created_at,started_at,updated_at')
      .eq('session_id', body.sessionId)
    if (runError) throw mapDatabaseError(runError.message)
    runs = (runRows ?? []) as Array<Record<string, unknown>>
  }
  return {
    session,
    participants: (players ?? []).map(player => {
      const run = runs.find(row => row.player_id === player.id) ?? null
      return { ...player, run }
    }),
  }
}

async function listParticipants(client: SupabaseClient, body: Record<string, unknown>) {
  if (!isUuid(body.sessionId)) throw apiError('invalid_session_id', 400)
  const { data: players, error } = await client
    .from('event_players')
    .select('id,nickname,joined_at,completion_status,completed_at')
    .eq('session_id', body.sessionId)
    .order('joined_at')
  if (error) throw mapDatabaseError(error.message)
  const playerRows = players ?? []
  const playerIds = playerRows.map(player => player.id)
  if (playerIds.length === 0) return { participants: [] }

  const { data: runs, error: runError } = await client
    .from('event_participant_runs')
    .select('id,player_id,status,progress,updated_at')
    .eq('session_id', body.sessionId)
  if (runError) throw mapDatabaseError(runError.message)
  const runRows = runs ?? []
  const runIds = runRows.map(run => run.id)
  let assignments: Array<{ run_id: string; scenario_id: string; ordinal: number }> = []
  if (runIds.length > 0) {
    const { data, error: assignmentError } = await client
      .from('event_run_scenarios')
      .select('run_id,scenario_id,ordinal')
      .in('run_id', runIds)
      .order('ordinal')
    if (assignmentError) throw mapDatabaseError(assignmentError.message)
    assignments = data ?? []
  }
  return {
    participants: playerRows.map(player => {
      const run = runRows.find(row => row.player_id === player.id)
      return {
        ...player,
        run: run ? {
          id: run.id,
          status: run.status,
          scenarioIds: assignments.filter(row => row.run_id === run.id).map(row => row.scenario_id),
          progress: run.progress,
          updatedAt: run.updated_at,
        } : null,
      }
    }),
  }
}

async function getParticipant(client: SupabaseClient, body: Record<string, unknown>) {
  if (!isUuid(body.sessionId) || !isUuid(body.playerId)) {
    throw apiError('invalid_participant_identity', 400)
  }
  const { data: player, error } = await client
    .from('event_players')
    .select('id,nickname,joined_at,completion_status,completed_at')
    .eq('session_id', body.sessionId)
    .eq('id', body.playerId)
    .maybeSingle()
  if (error) throw mapDatabaseError(error.message)
  if (!player) throw apiError('player_not_found', 404)

  const { data: run, error: runError } = await client
    .from('event_participant_runs')
    .select('id,status,progress,created_at,started_at,updated_at')
    .eq('session_id', body.sessionId)
    .eq('player_id', body.playerId)
    .maybeSingle()
  if (runError) throw mapDatabaseError(runError.message)
  if (!run) return { participant: player, run: null, scenarios: [], actions: [], result: null }

  const [assignments, progress, actions, result] = await Promise.all([
    client.from('event_run_scenarios').select('scenario_id,ordinal').eq('run_id', run.id).order('ordinal'),
    client.from('event_run_scenario_progress').select('*').eq('run_id', run.id).order('ordinal'),
    client.from('event_run_action_records').select('scenario_id,action_id,action_kind,correct,occurred_at').eq('run_id', run.id).order('occurred_at'),
    client.from('event_run_five_scenario_results').select('*').eq('run_id', run.id).maybeSingle(),
  ])
  for (const query of [assignments, progress, actions, result]) {
    if (query.error) throw mapDatabaseError(query.error.message)
  }
  return {
    participant: player,
    run,
    assignments: assignments.data ?? [],
    progress: progress.data ?? [],
    actions: actions.data ?? [],
    result: result.data,
  }
}

async function incidentAnalytics(client: SupabaseClient, body: Record<string, unknown>) {
  let sessionId: string | null = null
  if (body.sessionId !== undefined) {
    if (!isUuid(body.sessionId)) throw apiError('invalid_session_id', 400)
    sessionId = body.sessionId
  }
  let runsQuery = client
    .from('event_participant_runs')
    .select('id,session_id')
  if (sessionId) runsQuery = runsQuery.eq('session_id', sessionId)
  const { data: runs, error: runError } = await runsQuery
  if (runError) throw mapDatabaseError(runError.message)
  const runIds = (runs ?? []).map(run => run.id)
  if (runIds.length === 0) return { scenarios: [] }

  const [assignments, progress, actions] = await Promise.all([
    client.from('event_run_scenarios').select('run_id,scenario_id,ordinal').in('run_id', runIds),
    client.from('event_run_scenario_progress').select('run_id,scenario_id,state,resolution_correct,score_impact').in('run_id', runIds),
    client.from('event_run_action_records').select('run_id,scenario_id,action_kind,correct').in('run_id', runIds),
  ])
  for (const query of [assignments, progress, actions]) {
    if (query.error) throw mapDatabaseError(query.error.message)
  }
  const assignmentRows = assignments.data ?? []
  const progressRows = progress.data ?? []
  const actionRows = actions.data ?? []
  const scenarioIds = [...new Set(assignmentRows.map(row => row.scenario_id))].sort()
  return {
    scenarios: scenarioIds.map(scenarioId => {
      const assigned = assignmentRows.filter(row => row.scenario_id === scenarioId)
      const scenarioProgress = progressRows.filter(row => row.scenario_id === scenarioId)
      const scenarioActions = actionRows.filter(row => row.scenario_id === scenarioId)
      const assignedRunIds = new Set(assigned.map(row => row.run_id))
      const started = scenarioProgress.filter(row => row.state !== 'assigned')
      const completed = scenarioProgress.filter(row => row.state === 'completed')
      const resolvedCorrectly = scenarioProgress.filter(row => row.resolution_correct === true)
      const incorrectActions = scenarioActions.filter(row => row.correct === false).length
      const impacts = scenarioProgress
        .map(row => row.score_impact)
        .filter((impact): impact is number => typeof impact === 'number')
      return {
        scenarioId,
        assignments: assignedRunIds.size,
        started: started.length,
        completed: completed.length,
        resolvedCorrectly: resolvedCorrectly.length,
        incorrectActions,
        averageScoreImpact: impacts.length
          ? impacts.reduce((sum, impact) => sum + impact, 0) / impacts.length
          : null,
        completionPercentage: assignedRunIds.size
          ? (completed.length / assignedRunIds.size) * 100
          : 0,
      }
    }),
  }
}

async function getResults(client: SupabaseClient, body: Record<string, unknown>) {
  let sessionId: string | null = null
  if (body.sessionId !== undefined) {
    if (!isUuid(body.sessionId)) throw apiError('invalid_session_id', 400)
    sessionId = body.sessionId
  }
  let runsQuery = client
    .from('event_participant_runs')
    .select('id,session_id,player_id')
  if (sessionId) runsQuery = runsQuery.eq('session_id', sessionId)
  const { data: runs, error: runError } = await runsQuery
  if (runError) throw mapDatabaseError(runError.message)
  const runRows = runs ?? []
  const runIds = runRows.map(run => run.id)
  const playerIds = [...new Set(runRows.map(run => run.player_id))]
  if (runIds.length === 0) return { results: [] }

  const [players, results] = await Promise.all([
    client.from('event_players').select('id,nickname,completed_at').in('id', playerIds),
    client.from('event_run_five_scenario_results').select('*').in('run_id', runIds),
  ])
  if (players.error) throw mapDatabaseError(players.error.message)
  if (results.error) throw mapDatabaseError(results.error.message)
  const playerRows = players.data ?? []
  const resultRows = results.data ?? []
  return {
    results: runRows.flatMap(run => {
      const result = resultRows.find(row => row.run_id === run.id)
      if (!result) return []
      const player = playerRows.find(row => row.id === run.player_id)
      return [{
        playerId: run.player_id,
        nickname: player?.nickname ?? 'Unknown',
        sessionId: run.session_id,
        completionTimeMs: result.completion_time_ms,
        ...result,
      }]
    }).sort((left, right) =>
      right.final_score - left.final_score
      || left.completion_time_ms - right.completion_time_ms
      || left.nickname.localeCompare(right.nickname)),
  }
}

async function exportResults(client: SupabaseClient, body: Record<string, unknown>) {
  const { results } = await getResults(client, body)
  const rows = results as Array<Record<string, unknown>>
  const escapeCsv = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value)
    return `"${text.replace(/"/g, '""')}"`
  }
  const header = [
    'participantId',
    'nickname',
    'sessionId',
    'finalScore',
    'correctResolutions',
    'incorrectActions',
    'evidenceCollected',
    'completionTimeMs',
    'survivalRating',
  ]
  const csvRows = [header.map(escapeCsv).join(',')]
  for (const row of rows) {
    csvRows.push([
      row.playerId,
      row.nickname,
      row.sessionId,
      row.final_score,
      row.correct_resolutions,
      row.incorrect_actions,
      row.evidence_collected,
      row.completion_time_ms,
      row.survival_rating,
    ].map(escapeCsv).join(','))
  }
  return { filename: '3301-results.csv', csv: csvRows.join('\r\n') }
}

async function submitFiveScenarioResult(client: SupabaseClient, body: Record<string, unknown>) {
  if (!isUuid(body.sessionId) || !isUuid(body.playerId) || !isUuid(body.registrationId)) {
    throw apiError('invalid_participant_identity', 400)
  }
  if (!Array.isArray(body.decisionRecords) || typeof body.completionTimeMs !== 'number') {
    throw apiError('invalid_five_scenario_result', 400)
  }
  const { data, error } = await client.rpc('submit_event_run_five_scenario_result', {
    p_session_id: body.sessionId,
    p_player_id: body.playerId,
    p_registration_id: body.registrationId,
    p_decision_records: body.decisionRecords,
    p_completion_time_ms: Math.round(body.completionTimeMs),
  })
  if (error) throw mapDatabaseError(error.message)
  const submitted = Array.isArray(data) ? data[0] : data
  if (!isRecord(submitted) || typeof submitted.run_id !== 'string') {
    throw apiError('database_operation_failed', 500)
  }
  const { data: result, error: resultError } = await client
    .from('event_run_five_scenario_results')
    .select('*')
    .eq('run_id', submitted.run_id)
    .single()
  if (resultError) throw mapDatabaseError(resultError.message)
  return { result }
}

async function handleAction(request: Request, body: Record<string, unknown>) {
  const client = getAdminClient()
  switch (body.action) {
    case 'lookup':
      return lookupSession(client, body)
    case 'join':
      return joinSession(client, body)
    case 'start':
      return startParticipant(client, body)
    case 'get-run':
      return getRun(client, body)
    case 'save-progress':
      return saveRunProgress(client, body)
    case 'submit-result':
      return submitFiveScenarioResult(client, body)
    case 'admin-login':
      return setAdminSession(request, client)
    case 'admin-logout':
      await requireAdminSession(request, client)
      return revokeAdminSession(request, client)
    case 'admin-overview':
      await requireAdminSession(request, client)
      return adminOverview(client)
    case 'list-sessions':
      await requireAdminSession(request, client)
      return listSessions(client)
    case 'get-session':
      await requireAdminSession(request, client)
      return getSession(client, body)
    case 'list-participants':
      await requireAdminSession(request, client)
      return listParticipants(client, body)
    case 'get-participant':
      await requireAdminSession(request, client)
      return getParticipant(client, body)
    case 'get-incident-analytics':
      await requireAdminSession(request, client)
      return incidentAnalytics(client, body)
    case 'get-results':
      await requireAdminSession(request, client)
      return getResults(client, body)
    case 'export-results':
      await requireAdminSession(request, client)
      return exportResults(client, body)
    case 'create':
      if (request.headers.has('x-admin-session')) await requireAdminSession(request, client)
      else requireOrganizer(request)
      return createSession(client, body)
    case 'set-status':
      if (request.headers.has('x-admin-session')) await requireAdminSession(request, client)
      else requireOrganizer(request)
      return updateSessionStatus(client, body)
    case 'reset':
      if (request.headers.has('x-admin-session')) await requireAdminSession(request, client)
      else requireOrganizer(request)
      return resetSession(client, body)
    default:
      throw apiError('invalid_action', 400)
  }
}

const allowedOrigins = (Deno.env.get('CORS_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)

function responseHeaders(origin: string | null): Headers {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-admin-session',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  })
  if (origin && allowedOrigins.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
  }
  return headers
}

Deno.serve(async request => {
  const origin = request.headers.get('origin')
  const headers = responseHeaders(origin)
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405, headers })
  }
  if (origin && !allowedOrigins.includes(origin)) {
    return Response.json({ error: 'origin_not_allowed' }, { status: 403, headers })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400, headers })
  }
  if (!isRecord(body)) {
    return Response.json({ error: 'invalid_request' }, { status: 400, headers })
  }

  try {
    const data = isPublicJoinCodeAttempt(body)
      ? await handleRateLimitedJoinCodeAttempt(request, body)
      : await handleAction(request, body)
    return Response.json({ data }, { headers })
  } catch (error) {
    if (isRecord(error) && typeof error.status === 'number' && typeof error.code === 'string') {
      const api = error as ApiError
      if (api.status >= 500) console.error('session-api operation failed', api.code)
      return Response.json({ error: api.code }, { status: api.status, headers })
    }
    console.error('session-api unexpected failure')
    return Response.json({ error: 'internal_error' }, { status: 500, headers })
  }
})
