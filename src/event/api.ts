import { supabaseClient } from '../lib/supabase.ts'
import type { StoredParticipant } from './participant.ts'

export type EventSessionStatus = 'waiting' | 'active' | 'completed'

export interface EventSessionSummary {
  id: string
  name: string
  status: EventSessionStatus
  playerCount: number
  maxPlayers: number
}

export interface EventParticipantSummary {
  id: string
  nickname: string
  completionStatus: StoredParticipant['completionStatus']
  run: EventParticipantRun | null
}

export interface EventParticipantRun {
  id: string
  status: 'assigned' | 'in_progress' | 'completed'
  scenarioIds: string[]
  progress: Record<string, unknown>
  updatedAt: string
}

const USER_MESSAGES: Record<string, string> = {
  invalid_session_id: 'Enter a valid session ID.',
  invalid_registration: 'Enter a nickname between 1 and 32 characters.',
  session_not_found: 'We could not find that event session. Check the ID and try again.',
  session_full: 'This event session is full.',
  session_not_open: 'This session is no longer accepting participants.',
  session_not_active: 'This session is not active. Wait for the organizer or return to the session screen.',
  player_not_found: 'This participant registration could not be verified.',
  player_completed: 'This participant registration is already complete.',
  organizer_unauthorized: 'Organizer authorization was rejected.',
  invalid_status_transition: 'That session status change is not allowed.',
  session_state_changed: 'The session changed while your request was being processed. Refresh and try again.',
  invalid_run_progress: 'The saved game progress is invalid or too large.',
  run_not_found: 'No saved scenario run was found for this participant.',
  scenario_pool_unavailable: 'Scenario assignments are temporarily unavailable. Try again shortly.',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function errorMessage(error: { message: string; context?: unknown }): Promise<string> {
  if (error.context instanceof Response) {
    try {
      const payload: unknown = await error.context.clone().json()
      if (isRecord(payload) && typeof payload.error === 'string') {
        return USER_MESSAGES[payload.error] ?? payload.error
      }
    } catch {
      return `Event service request failed: ${error.message}`
    }
  }
  return `Event service request failed: ${error.message}`
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabaseClient) throw new Error('Event joining is not configured for this deployment.')
  const { data, error } = await supabaseClient.functions.invoke('session-api', { body })
  if (error) throw new Error(await errorMessage(error))
  if (!isRecord(data) || !('data' in data)) throw new Error('Event service returned an invalid response.')
  return data.data as T
}

async function adminInvoke<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabaseClient) throw new Error('Supabase event service is not configured.')
  const sessionToken = loadAdminSessionToken()
  if (!sessionToken) throw new Error('Organizer login is required.')
  const { data, error } = await supabaseClient.functions.invoke('session-api', {
    body,
    headers: { 'x-admin-session': sessionToken },
  })
  if (error) throw new Error(await errorMessage(error))
  if (!isRecord(data) || !('data' in data)) throw new Error('Event service returned an invalid response.')
  return data.data as T
}

export const ADMIN_SESSION_KEY = '3301.admin-session'

export function loadAdminSessionToken(): string | null {
  try {
    const value = sessionStorage.getItem(ADMIN_SESSION_KEY)
    return value && /^[A-Za-z0-9-]+$/.test(value) ? value : null
  } catch {
    return null
  }
}

export function saveAdminSessionToken(token: string): void {
  sessionStorage.setItem(ADMIN_SESSION_KEY, token)
}

export function clearAdminSessionToken(): void {
  sessionStorage.removeItem(ADMIN_SESSION_KEY)
}

export async function lookupEventSession(sessionId: string): Promise<EventSessionSummary> {
  const response = await invoke<{ session: EventSessionSummary }>({ action: 'lookup', sessionId })
  return response.session
}

export async function joinEventSession(input: {
  sessionId: string
  registrationId: string
  nickname: string
}): Promise<{
  session: EventSessionSummary
  participant: Omit<EventParticipantSummary, 'run'> & { run: null }
  created: boolean
}> {
  return invoke({ action: 'join', ...input })
}

export async function refreshEventParticipant(participant: StoredParticipant): Promise<{
  session: EventSessionSummary
  participant: EventParticipantSummary
}> {
  if (!participant.playerId) throw new Error('Participant registration is still pending.')
  return invoke({
    action: 'lookup',
    sessionId: participant.sessionId,
    playerId: participant.playerId,
    registrationId: participant.registrationId,
  })
}

export async function authorizeParticipantStart(participant: StoredParticipant): Promise<{
  session: EventSessionSummary
  participant: Pick<EventParticipantSummary, 'id' | 'completionStatus' | 'run'>
}> {
  if (!participant.playerId) throw new Error('Participant registration is still pending.')
  return invoke({
    action: 'start',
    sessionId: participant.sessionId,
    playerId: participant.playerId,
    registrationId: participant.registrationId,
  })
}

export async function getParticipantRun(participant: StoredParticipant): Promise<EventParticipantRun> {
  if (!participant.playerId) throw new Error('Participant registration is still pending.')
  const response = await invoke<{ run: EventParticipantRun }>({
    action: 'get-run',
    sessionId: participant.sessionId,
    playerId: participant.playerId,
    registrationId: participant.registrationId,
  })
  return response.run
}

export async function saveParticipantRunProgress(
  participant: StoredParticipant,
  progress: Record<string, unknown>,
): Promise<{ saved: true; updatedAt: string }> {
  if (!participant.playerId) throw new Error('Participant registration is still pending.')
  return invoke({
    action: 'save-progress',
    sessionId: participant.sessionId,
    playerId: participant.playerId,
    registrationId: participant.registrationId,
    progress,
  })
}

export async function submitParticipantFiveScenarioResult(
  participant: StoredParticipant,
  decisionRecords: Array<Record<string, unknown>>,
  completionTimeMs: number,
): Promise<{ saved: true; result: Record<string, unknown> }> {
  if (!participant.playerId) throw new Error('Participant registration is still pending.')
  const response = await invoke<{ result: Record<string, unknown> }>({
    action: 'submit-result',
    sessionId: participant.sessionId,
    playerId: participant.playerId,
    registrationId: participant.registrationId,
    decisionRecords,
    completionTimeMs,
  })
  return { saved: true, result: response.result }
}

export async function adminLogin(organizerToken: string): Promise<{
  sessionToken: string
  expiresAt: string
}> {
  if (!supabaseClient) throw new Error('Supabase event service is not configured.')
  const { data, error } = await supabaseClient.functions.invoke('session-api', {
    body: { action: 'admin-login' },
    headers: { authorization: `Bearer ${organizerToken}` },
  })
  if (error) throw new Error(await errorMessage(error))
  if (!isRecord(data) || !isRecord(data.data)) throw new Error('Organizer login returned an invalid response.')
  const result = data.data as { sessionToken?: string; expiresAt?: string }
  if (!result.sessionToken || !result.expiresAt) throw new Error('Organizer login returned an invalid session.')
  saveAdminSessionToken(result.sessionToken)
  return { sessionToken: result.sessionToken, expiresAt: result.expiresAt }
}

export async function adminLogout(): Promise<void> {
  try {
    await adminInvoke({ action: 'admin-logout' })
  } finally {
    clearAdminSessionToken()
  }
}

export async function getAdminOverview(): Promise<Record<string, unknown>> {
  return adminInvoke({ action: 'admin-overview' })
}

export async function getAdminSessions(): Promise<{ sessions: Array<Record<string, unknown>> }> {
  return adminInvoke({ action: 'list-sessions' })
}

export async function createAdminSession(input: {
  name: string
  maxPlayers: number
}): Promise<{ session: EventSessionSummary }> {
  return adminInvoke({ action: 'create', ...input })
}

export async function setAdminSessionStatus(sessionId: string, status: EventSessionStatus): Promise<{
  session: EventSessionSummary
}> {
  return adminInvoke({ action: 'set-status', sessionId, status })
}

export async function resetAdminSession(sessionId: string): Promise<{ session: EventSessionSummary }> {
  return adminInvoke({ action: 'reset', sessionId, confirmSessionId: sessionId })
}

export async function getAdminSession(sessionId: string): Promise<Record<string, unknown>> {
  return adminInvoke({ action: 'get-session', sessionId })
}

export async function getAdminParticipants(sessionId: string): Promise<{
  participants: Array<Record<string, unknown>>
}> {
  return adminInvoke({ action: 'list-participants', sessionId })
}

export async function getAdminParticipant(sessionId: string, playerId: string): Promise<Record<string, unknown>> {
  return adminInvoke({ action: 'get-participant', sessionId, playerId })
}

export async function getIncidentAnalytics(sessionId?: string): Promise<{
  scenarios: Array<Record<string, unknown>>
}> {
  return adminInvoke({
    action: 'get-incident-analytics',
    ...(sessionId ? { sessionId } : {}),
  })
}

export async function getAdminResults(sessionId?: string): Promise<{
  results: Array<Record<string, unknown>>
}> {
  return adminInvoke({
    action: 'get-results',
    ...(sessionId ? { sessionId } : {}),
  })
}

export async function exportAdminResults(sessionId?: string): Promise<{
  filename: string
  csv: string
}> {
  return adminInvoke({
    action: 'export-results',
    ...(sessionId ? { sessionId } : {}),
  })
}
