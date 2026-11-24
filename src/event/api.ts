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
  participant: EventParticipantSummary
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
  participant: Pick<EventParticipantSummary, 'id' | 'completionStatus'>
}> {
  if (!participant.playerId) throw new Error('Participant registration is still pending.')
  return invoke({
    action: 'start',
    sessionId: participant.sessionId,
    playerId: participant.playerId,
    registrationId: participant.registrationId,
  })
}
