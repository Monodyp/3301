import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { canTransitionSession, isSessionStatus, type SessionStatus } from '../_shared/session-rules.ts'

interface ApiError extends Error {
  status: number
  code: string
}

let adminClient: SupabaseClient | undefined

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

function mapDatabaseError(message: string): ApiError {
  const value = message.toLowerCase()
  if (value.includes('session_not_found')) return apiError('session_not_found', 404)
  if (value.includes('player_not_found')) return apiError('player_not_found', 404)
  if (value.includes('invalid_registration')) return apiError('invalid_registration', 400)
  if (value.includes('organizer_not_configured')) return apiError('organizer_not_configured', 503)
  if (value.includes('session_full')) return apiError('session_full', 409)
  if (value.includes('session_not_open')) return apiError('session_not_open', 409)
  if (value.includes('session_not_active')) return apiError('session_not_active', 409)
  if (value.includes('invalid_status_transition')) return apiError('invalid_status_transition', 409)
  if (value.includes('invalid_session_update')) return apiError('invalid_session_update', 400)
  if (value.includes('player_completed')) return apiError('player_completed', 409)
  return apiError('database_operation_failed', 500)
}

function sessionSummary(
  session: { id: string; name: string; status: SessionStatus; max_players: number },
  playerCount: number,
) {
  return {
    id: session.id,
    name: session.name,
    status: session.status,
    playerCount,
    maxPlayers: session.max_players,
  }
}

async function getSessionSummary(client: SupabaseClient, sessionId: string) {
  const { data: session, error } = await client
    .from('event_sessions')
    .select('id, name, status, max_players')
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

async function lookupSession(client: SupabaseClient, body: Record<string, unknown>) {
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
    }
  }
  return response
}

async function joinSession(client: SupabaseClient, body: Record<string, unknown>) {
  const sessionId = body.sessionId
  const registrationId = body.registrationId
  const nickname = cleanText(body.nickname, 1, 32)
  if (!isUuid(sessionId)) throw apiError('invalid_session_id', 400)
  if (!isUuid(registrationId) || !nickname) throw apiError('invalid_registration', 400)

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
  return {
    participant: {
      id: player.result_player_id,
      completionStatus: player.result_completion_status,
    },
    session: await getSessionSummary(client, body.sessionId),
  }
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
    .select('id, name, status, max_players')
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

async function handleAction(request: Request, body: Record<string, unknown>) {
  const client = getAdminClient()
  switch (body.action) {
    case 'lookup':
      return lookupSession(client, body)
    case 'join':
      return joinSession(client, body)
    case 'start':
      return startParticipant(client, body)
    case 'create':
      requireOrganizer(request)
      return createSession(client, body)
    case 'set-status':
      requireOrganizer(request)
      return updateSessionStatus(client, body)
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
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
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
    return Response.json({ data: await handleAction(request, body) }, { headers })
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
