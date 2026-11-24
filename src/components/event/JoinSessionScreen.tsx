import { useEffect, useState, type FormEvent } from 'react'
import {
  authorizeParticipantStart,
  joinEventSession,
  lookupEventSession,
  refreshEventParticipant,
  type EventParticipantSummary,
  type EventSessionSummary,
} from '../../event/api.ts'
import {
  EVENT_PARTICIPANT_KEY,
  loadStoredParticipant,
  normalizeNickname,
  normalizeSessionId,
  registrationIdForSession,
  saveStoredParticipant,
  type StoredParticipant,
} from '../../event/participant.ts'
import { isSupabaseConfigured, supabaseConfigurationError } from '../../lib/supabase.ts'

interface JoinSessionScreenProps {
  hasSavedEventRun: boolean
  onBeginRun: (resume: boolean) => void
  onLocalPractice: () => void
}

function storedName(participant: StoredParticipant | null): string {
  return participant?.sessionName ?? ''
}

export function JoinSessionScreen({
  hasSavedEventRun,
  onBeginRun,
  onLocalPractice,
}: JoinSessionScreenProps) {
  const [saved] = useState(loadStoredParticipant)
  const [participant, setParticipant] = useState<StoredParticipant | null>(() => saved?.playerId ? saved : null)
  const [draft, setDraft] = useState<StoredParticipant | null>(saved)
  const [sessionId, setSessionId] = useState(
    saved?.sessionId ?? new URLSearchParams(window.location.search).get('session') ?? '',
  )
  const [nickname, setNickname] = useState(saved?.nickname ?? '')
  const [session, setSession] = useState<EventSessionSummary | null>(null)
  const [remoteParticipant, setRemoteParticipant] = useState<EventParticipantSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!participant) return
    let cancelled = false
    const refresh = async () => {
      try {
        const status = await refreshEventParticipant(participant)
        if (cancelled) return
        setSession(status.session)
        setRemoteParticipant(status.participant)
        setError(null)
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not refresh event status.')
      }
    }

    void refresh()
    const interval = window.setInterval(() => void refresh(), 4000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [participant])

  const join = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setNotice(null)
    const validSessionId = normalizeSessionId(sessionId)
    if (!validSessionId) {
      setError('Enter a valid session ID.')
      return
    }
    const validNickname = normalizeNickname(nickname)
    if (!validNickname) {
      setError('Enter a nickname between 1 and 32 characters.')
      return
    }
    if (!isSupabaseConfigured) {
      setError(supabaseConfigurationError ?? 'Event joining is not configured for this deployment.')
      return
    }

    setBusy(true)
    try {
      const registrationId = registrationIdForSession(draft, validSessionId)
      const preview = await lookupEventSession(validSessionId)
      setSession(preview)
      const pending: StoredParticipant = {
        sessionId: validSessionId,
        registrationId,
        playerId: null,
        nickname: validNickname,
        sessionName: '',
        completionStatus: 'joined',
        eventRunStarted: false,
      }
      saveStoredParticipant(pending)
      setDraft(pending)
      const result = await joinEventSession({
        sessionId: validSessionId,
        registrationId,
        nickname: validNickname,
      })
      const registered: StoredParticipant = {
        ...pending,
        playerId: result.participant.id,
        nickname: result.participant.nickname,
        sessionName: result.session.name,
        completionStatus: result.participant.completionStatus,
      }
      saveStoredParticipant(registered)
      setParticipant(registered)
      setDraft(registered)
      setSession(result.session)
      setRemoteParticipant(result.participant)
      setSessionId(validSessionId)
      setNotice(result.created
        ? `You joined ${result.session.name}.`
        : 'This browser was already registered for this session. Your place is restored.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not join this session. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const begin = async () => {
    if (!participant || !session || session.status !== 'active') return
    setBusy(true)
    setError(null)
    try {
      const result = await authorizeParticipantStart(participant)
      if (result.session.status !== 'active') {
        setSession(result.session)
        throw new Error(result.session.status === 'completed'
          ? 'This event session has ended.'
          : 'The organizer has not started this session yet.')
      }
      const resume = participant.eventRunStarted && hasSavedEventRun
      const updated: StoredParticipant = {
        ...participant,
        completionStatus: result.participant.completionStatus,
        eventRunStarted: true,
      }
      saveStoredParticipant(updated)
      setParticipant(updated)
      setRemoteParticipant({
        id: result.participant.id,
        nickname: participant.nickname,
        completionStatus: result.participant.completionStatus,
      })
      onBeginRun(resume)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not verify session status.')
    } finally {
      setBusy(false)
    }
  }

  const switchSession = () => {
    try {
      localStorage.removeItem(EVENT_PARTICIPANT_KEY)
      setParticipant(null)
      setDraft(null)
      setSession(null)
      setRemoteParticipant(null)
      setSessionId('')
      setNickname('')
      setError(null)
      setNotice(null)
    } catch {
      setError("Could not clear this device's saved event registration.")
    }
  }

  const inputSessionId = normalizeSessionId(sessionId)
  const inputNickname = normalizeNickname(nickname)
  const serviceConfigurationMessage = supabaseConfigurationError
    ?? (!isSupabaseConfigured ? 'Event service configuration is missing. This session cannot be joined yet.' : null)
  const currentStatus = session?.status
  const canStart = Boolean(
    participant
      && session
      && currentStatus === 'active'
      && remoteParticipant
      && remoteParticipant.completionStatus !== 'completed',
  )

  return (
    <main className="event-screen">
      <section className="event-card" aria-labelledby="event-heading">
        <div className="event-brand">3301 · SEMINAR SESSION</div>
        <h1 id="event-heading">{participant ? 'Event check-in' : 'Join an event'}</h1>
        <p className="event-intro">
          {participant
            ? 'Your registration is saved on this device. Session status updates automatically.'
            : 'Enter the session ID provided by your organizer and choose a display nickname.'}
        </p>

        {!participant ? (
          <form className="event-join-form" onSubmit={join}>
            <label htmlFor="event-session-id">Session ID</label>
            <input
              id="event-session-id"
              name="sessionId"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={sessionId}
              onChange={event => setSessionId(event.target.value)}
              placeholder="Paste the event session ID"
              aria-invalid={Boolean(sessionId) && !inputSessionId}
            />
            {sessionId.trim() && !inputSessionId && (
              <p className="event-field-error" role="alert">Enter a valid session ID.</p>
            )}
            <label htmlFor="event-nickname">Nickname</label>
            <input
              id="event-nickname"
              name="nickname"
              autoComplete="nickname"
              maxLength={64}
              value={nickname}
              onChange={event => setNickname(event.target.value)}
              placeholder="How should we display your name?"
              aria-invalid={Boolean(nickname) && !inputNickname}
            />
            {nickname && !inputNickname && (
              <p className="event-field-error" role="alert">Use 1 to 32 characters without line breaks.</p>
            )}
            <p className="event-hint">Nicknames are display names and do not need to be unique.</p>
            {session && session.id === inputSessionId && (
              <div className={`event-status event-status-${session.status}`}>
                <strong>{session.name}</strong>
                <span>{session.playerCount} / {session.maxPlayers} participants</span>
                {session.playerCount >= session.maxPlayers && <span>This session is full.</span>}
              </div>
            )}
            {error && <p className="event-error" role="alert">{error}</p>}
            {serviceConfigurationMessage && (
              <p className="event-error" role="alert">{serviceConfigurationMessage}</p>
            )}
            <button
              className="event-primary-button"
              type="submit"
              disabled={busy || !inputSessionId || !inputNickname || !isSupabaseConfigured}
            >
              {busy ? 'Joining...' : 'Join session'}
            </button>
          </form>
        ) : (
          <div className="event-participant-view" aria-live="polite">
            <div className="event-identity">
              <span>Participant</span>
              <strong>{participant.nickname}</strong>
            </div>
            <div className="event-identity">
              <span>Session</span>
              <strong>{storedName(participant) || session?.name || 'Loading session…'}</strong>
            </div>

            {session && (
              <div className={`event-status event-status-${session.status}`}>
                <span className="event-status-indicator" />
                <strong>
                  {session.status === 'waiting' && 'Waiting for the organizer to start'}
                  {session.status === 'active' && 'Session is active'}
                  {session.status === 'completed' && 'This event session has ended'}
                </strong>
                <span>{session.playerCount} / {session.maxPlayers} participants</span>
              </div>
            )}
            {!session && !error && <p className="event-loading">Checking session status…</p>}
            {error && <p className="event-error" role="alert">{error}</p>}
            {notice && <p className="event-notice" role="status">{notice}</p>}

            {session?.status === 'waiting' && (
              <p className="event-hint">Keep this page open. You can begin when the organizer activates the session.</p>
            )}
            {session?.status === 'active' && (
              <button
                className="event-primary-button"
                type="button"
                disabled={!canStart || busy}
                onClick={begin}
              >
                {busy ? 'Verifying session...' : participant.eventRunStarted && hasSavedEventRun ? 'Resume game' : 'Begin game'}
              </button>
            )}
            {session?.status === 'completed' && (
              <p className="event-hint">The organizer has closed this session. You cannot start a new event run.</p>
            )}
            <button className="event-switch-button" type="button" onClick={switchSession}>
              Use a different session
            </button>
            <p className="event-hint">This only clears the registration saved on this device. It does not delete an event record.</p>
          </div>
        )}

        <div className="event-footer">
          <span>Seminar events use shared session records. Local practice stays on this device.</span>
          <button type="button" onClick={onLocalPractice}>Use local practice</button>
        </div>
      </section>
    </main>
  )
}
