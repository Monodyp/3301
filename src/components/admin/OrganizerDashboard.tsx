import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import QRCode from 'qrcode'
import '../../styles/organizer.css'
import {
  participantIncidentProgress,
  summarizeIncidentProgress,
  type IncidentStatus,
  type ParticipantIncidentProgress,
} from '../../event/adminProgress'
import { buildSessionLeaderboards } from '../../event/leaderboards'
import {
  adminLogin,
  adminLogout,
  archiveAdminSession,
  clearAdminSessionToken,
  createAdminSession,
  exportAdminResults,
  getAdminOverview,
  getAdminParticipant,
  getAdminParticipants,
  getAdminResults,
  getAdminSessions,
  getIncidentAnalytics,
  loadAdminSessionToken,
  resetAdminSession,
  setAdminSessionStatus,
  type EventSessionStatus,
} from '../../event/api'
import { normalizeJoinCode, playerJoinUrl } from '../../event/participant'

type Section = 'overview' | 'sessions' | 'participants' | 'leaderboards' | 'analytics' | 'results'

const ADMIN_REFRESH_INTERVAL_MS = 15_000
const INCIDENT_REFRESH_INTERVAL_MS = 5_000

function formatDate(value: unknown): string {
  if (typeof value !== 'string' || !value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

function formatDuration(milliseconds: unknown): string {
  if (typeof milliseconds !== 'number' || milliseconds < 0) return '—'
  const seconds = Math.round(milliseconds / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function incidentsForRun(run: Record<string, unknown> | null): ParticipantIncidentProgress[] {
  if (!run || typeof run.id !== 'string') return []
  return participantIncidentProgress(run.id, run.scenarioIds, run.incidentProgress)
}

function incidentsForParticipantDetail(detail: Record<string, unknown>): ParticipantIncidentProgress[] {
  const run = detail.run
  if (!isRecord(run) || typeof run.id !== 'string') return []
  const assignments = Array.isArray(detail.assignments) ? detail.assignments : []
  const scenarioIds = assignments.flatMap(assignment => {
    if (!isRecord(assignment)) return []
    const scenarioId = assignment.scenario_id
    return typeof scenarioId === 'string' ? [scenarioId] : []
  })
  return participantIncidentProgress(run.id, scenarioIds, detail.progress)
}

function incidentStatusLabel(status: IncidentStatus): string {
  return status === 'in-progress' ? 'In progress' : status === 'resolved' ? 'Resolved' : 'Unresolved'
}

export function OrganizerDashboard() {
  const [section, setSection] = useState<Section>('overview')
  const [loggedIn, setLoggedIn] = useState(() => Boolean(loadAdminSessionToken()))
  const [tokenDraft, setTokenDraft] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null)
  const [sessions, setSessions] = useState<Array<Record<string, unknown>>>([])
  const [sessionFilter, setSessionFilter] = useState('')
  const [participants, setParticipants] = useState<Array<Record<string, unknown>>>([])
  const [analytics, setAnalytics] = useState<Array<Record<string, unknown>>>([])
  const [results, setResults] = useState<Array<Record<string, unknown>>>([])
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [participantDetail, setParticipantDetail] = useState<Record<string, unknown> | null>(null)
  const [participantSearch, setParticipantSearch] = useState('')
  const [participantSort, setParticipantSort] = useState<'nickname' | 'joined' | 'status'>('joined')
  const [selectedParticipantId, setSelectedParticipantId] = useState('')
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [createName, setCreateName] = useState('')
  const [createCapacity, setCreateCapacity] = useState(60)
  const [createdJoinCode, setCreatedJoinCode] = useState('')
  const [createdLink, setCreatedLink] = useState('')
  const [createdQr, setCreatedQr] = useState('')
  const refreshInProgress = useRef(false)

  const loadSessionData = useCallback(async (
    activeSection: Section,
    sessionId: string,
    filterSessionId: string,
  ) => {
    if (activeSection === 'participants') {
      const response = await getAdminParticipants(sessionId)
      setParticipants(response.participants)
      return
    }
    if (activeSection === 'leaderboards') {
      const [participantResponse, resultResponse] = await Promise.all([
        getAdminParticipants(sessionId),
        getAdminResults(sessionId),
      ])
      setParticipants(participantResponse.participants)
      setResults(resultResponse.results)
      return
    }
    if (activeSection === 'analytics') {
      const response = await getIncidentAnalytics(filterSessionId || undefined)
      setAnalytics(response.scenarios)
      return
    }
    if (activeSection === 'results') {
      const response = await getAdminResults(filterSessionId || undefined)
      setResults(response.results)
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!loggedIn || refreshInProgress.current) return
    refreshInProgress.current = true
    setBusy(true)
    try {
      const liveSessionView = Boolean(selectedSessionId)
        && (section === 'participants' || section === 'leaderboards')
      if (liveSessionView) {
        await loadSessionData(section, selectedSessionId, sessionFilter)
        if (section === 'participants' && selectedParticipantId) {
          setParticipantDetail(await getAdminParticipant(selectedSessionId, selectedParticipantId))
        }
      } else {
        const [overviewResponse, sessionResponse] = await Promise.all([
          getAdminOverview(),
          getAdminSessions(),
        ])
        setOverview(overviewResponse)
        setSessions(sessionResponse.sessions)
        if (selectedSessionId || section === 'analytics' || section === 'results') {
          await loadSessionData(section, selectedSessionId, sessionFilter)
        }
      }
      setLastRefresh(new Date())
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Could not refresh organizer data.')
      if (/login|required|unauthorized/i.test(error instanceof Error ? error.message : '')) {
        clearAdminSessionToken()
        setLoggedIn(false)
      }
    } finally {
      refreshInProgress.current = false
      setBusy(false)
    }
  }, [loadSessionData, loggedIn, section, selectedParticipantId, selectedSessionId, sessionFilter])

  const refreshInterval = (section === 'participants' || section === 'leaderboards') && selectedSessionId
    ? INCIDENT_REFRESH_INTERVAL_MS
    : ADMIN_REFRESH_INTERVAL_MS
  useEffect(() => {
    if (!loggedIn) return
    void refresh()
    const interval = window.setInterval(() => void refresh(), refreshInterval)
    return () => window.clearInterval(interval)
  }, [loggedIn, refresh, refreshInterval])

  useEffect(() => {
    if (!createdLink) {
      setCreatedQr('')
      return
    }
    void QRCode.toDataURL(createdLink, { width: 220, margin: 1 })
      .then(setCreatedQr)
      .catch(() => setCreatedQr(''))
  }, [createdLink])

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setLoginError(null)
    try {
      await adminLogin(tokenDraft)
      setTokenDraft('')
      setLoggedIn(true)
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Organizer login failed.')
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    await adminLogout()
    setLoggedIn(false)
    setOverview(null)
    setSessions([])
    setParticipants([])
    setParticipantDetail(null)
    setSelectedParticipantId('')
  }

  const createSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setNotice(null)
    try {
      const response = await createAdminSession({ name: createName, maxPlayers: createCapacity })
      const session = response.session
      const link = playerJoinUrl(window.location.origin, session.joinCode)
      setCreatedJoinCode(session.joinCode)
      setCreatedLink(link)
      setCreateName('')
      setNotice(`Session created: ${session.name}`)
      await refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not create session.')
    } finally {
      setBusy(false)
    }
  }

  const changeStatus = async (sessionId: string, status: EventSessionStatus) => {
    setBusy(true)
    setNotice(null)
    try {
      await setAdminSessionStatus(sessionId, status)
      setNotice(status === 'active' ? 'Session started.' : 'Session completed.')
      await refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not change session status.')
    } finally {
      setBusy(false)
    }
  }

  const resetSession = async (sessionId: string) => {
    if (!window.confirm('Reset this session? Runs, assignments, progress, and results for the session will be deleted. Participant registrations and nicknames will remain.')) return
    setBusy(true)
    setNotice(null)
    try {
      await resetAdminSession(sessionId)
      setNotice('Session reset to waiting.')
      await refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not reset session.')
    } finally {
      setBusy(false)
    }
  }

  const deleteSession = async (session: Record<string, unknown>) => {
    const sessionId = String(session.id ?? '')
    const sessionName = String(session.name ?? 'Unnamed session')
    const joinCode = String(session.join_code ?? 'unknown code')
    if (!window.confirm(
      `Delete session "${sessionName}" (${joinCode})?\n\nThis will archive the session and prevent participants from joining. Participant records and results will be kept for historical review, and this join code will never be reused.`,
    )) return

    setBusy(true)
    setNotice(null)
    try {
      const response = await archiveAdminSession(sessionId)
      if (selectedSessionId === sessionId) {
        setSelectedSessionId('')
        setSelectedParticipantId('')
        setParticipantDetail(null)
        setParticipants([])
        setAnalytics([])
        setResults([])
      }
      if (sessionFilter === sessionId) {
        setSessionFilter('')
        setResults([])
      }
      setNotice(response.alreadyArchived
        ? `Session "${sessionName}" was already archived.`
        : `Session "${sessionName}" archived. Participant and result history was retained.`)
      await refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not archive session.')
    } finally {
      setBusy(false)
    }
  }

  const selectSession = (sessionId: string) => {
    if (sessions.some(session => String(session.id) === sessionId && session.status === 'archived')) return
    setSelectedSessionId(sessionId)
    setSelectedParticipantId('')
    setParticipantDetail(null)
    setParticipants([])
    setResults([])
    setAnalytics([])
  }

  const viewArchivedResults = (sessionId: string) => {
    setSessionFilter(sessionId)
    setSection('results')
    setSelectedSessionId('')
    setSelectedParticipantId('')
    setParticipantDetail(null)
    setParticipants([])
    setResults([])
  }

  const selectParticipant = async (playerId: string) => {
    if (!selectedSessionId) return
    setSelectedParticipantId(playerId)
    try {
      setParticipantDetail(await getAdminParticipant(selectedSessionId, playerId))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load participant.')
    }
  }

  const downloadCsv = async () => {
    try {
      const exported = await exportAdminResults(selectedSessionId || undefined)
      const blob = new Blob([exported.csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = exported.filename
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not export results.')
    }
  }

  const filteredParticipants = useMemo(() => {
    const filtered = participants.filter(participant => {
      const nickname = String(participant.nickname ?? '').toLowerCase()
      return nickname.includes(participantSearch.toLowerCase())
    })
    return [...filtered].sort((left, right) => {
      if (participantSort === 'nickname') return String(left.nickname).localeCompare(String(right.nickname))
      if (participantSort === 'status') return String(left.completion_status).localeCompare(String(right.completion_status))
      return String(right.joined_at).localeCompare(String(left.joined_at))
    })
  }, [participants, participantSearch, participantSort])
  const sessionProgress = useMemo(() => summarizeIncidentProgress(
    participants.map(participant => {
      const run = isRecord(participant.run) ? participant.run : null
      return incidentsForRun(run)
    }),
  ), [participants])
  const sessionLeaderboards = useMemo(
    () => buildSessionLeaderboards(selectedSessionId, participants, results),
    [participants, results, selectedSessionId],
  )
  const activeSessions = sessions.filter(session => session.status !== 'archived')
  const archivedSessions = sessions.filter(session => session.status === 'archived')

  if (!loggedIn) {
    return (
      <main className="organizer-shell organizer-login">
        <section className="organizer-login-card">
          <div className="organizer-brand">3301 · ORGANIZER</div>
          <h1>Secure administration</h1>
          <p>Enter the organizer access secret configured in Supabase. It is never stored by this dashboard.</p>
          <form onSubmit={login}>
            <label htmlFor="organizer-token">Organizer access secret</label>
            <input
              id="organizer-token"
              type="password"
              value={tokenDraft}
              onChange={event => setTokenDraft(event.target.value)}
              autoComplete="current-password"
              required
            />
            {loginError && <p className="organizer-error" role="alert">{loginError}</p>}
            <button type="submit" disabled={busy || !tokenDraft}>Enter dashboard</button>
          </form>
        </section>
      </main>
    )
  }

  const incidentStats = overview?.incidentStats as Record<string, number> | undefined
  const overallIncidentProgress = incidentStats
    ? {
      resolved: typeof incidentStats.resolved === 'number' ? incidentStats.resolved : 0,
      total: typeof incidentStats.assigned === 'number' ? incidentStats.assigned : 0,
    }
    : null
  const selectedSession = sessions.find(session => String(session.id) === selectedSessionId)
  const selectedSessionJoinCode = typeof selectedSession?.join_code === 'string' ? selectedSession.join_code : ''
  const selectedSessionJoinLink = normalizeJoinCode(selectedSessionJoinCode)
    ? playerJoinUrl(window.location.origin, selectedSessionJoinCode)
    : ''
  const selectedParticipantIncidents = participantDetail
    ? incidentsForParticipantDetail(participantDetail)
    : []

  return (
    <main className="organizer-shell">
      <aside className="organizer-sidebar">
        <div className="organizer-brand">3301 · ORGANIZER</div>
        <nav aria-label="Organizer sections">
          {([
            ['overview', 'Overview'],
            ['sessions', 'Sessions'],
            ['participants', 'Participants'],
            ['leaderboards', 'Leaderboards'],
            ['analytics', 'Incident Analytics'],
            ['results', 'Results'],
          ] as Array<[Section, string]>).map(([key, label]) => (
            <button key={key} className={section === key ? 'active' : ''} onClick={() => setSection(key)}>
              {label}
            </button>
          ))}
        </nav>
        <button className="organizer-logout" type="button" onClick={logout}>End session</button>
      </aside>
      <section className="organizer-content">
        <header className="organizer-header">
          <div>
            <span className="organizer-kicker">SEMINAR CONTROL</span>
            <h1>{section === 'overview' ? 'Overview' : section === 'sessions' ? 'Sessions' : section === 'participants' ? 'Participants' : section === 'leaderboards' ? 'Leaderboards' : section === 'analytics' ? 'Incident Analytics' : 'Results'}</h1>
          </div>
          <div className="organizer-refresh">
            <span>{busy ? 'Refreshing…' : lastRefresh ? `Last refreshed ${lastRefresh.toLocaleTimeString()}` : 'Not refreshed'}</span>
            {(section === 'participants' || section === 'leaderboards') && selectedSessionId && <span>Auto-refreshes every 5 seconds</span>}
            <button type="button" onClick={() => void refresh()} disabled={busy}>Refresh</button>
          </div>
        </header>
        {notice && <p className="organizer-notice" role="status">{notice}</p>}

        {section === 'overview' && (
          <div className="organizer-grid">
            {[
              ['Total sessions', overview?.totalSessions],
              ['Waiting', overview?.waitingSessions],
              ['Active', overview?.activeSessions],
              ['Completed sessions', overview?.completedSessions],
              ['Archived sessions', overview?.archivedSessions],
              ['Registered participants', overview?.totalParticipants],
              ['In progress', overview?.participantsInProgress],
              ['Completed runs', overview?.participantsCompleted],
              ['Average score', typeof overview?.averageParticipantScore === 'number'
                ? Math.round(Number(overview.averageParticipantScore))
                : 'No scores'],
            ].map(([label, value]) => (
              <article className="organizer-stat" key={String(label)}>
                <span>{typeof label === 'string' ? label : '—'}</span>
                <strong>{typeof value === 'number' || typeof value === 'string' ? String(value) : '—'}</strong>
              </article>
            ))}
            <article className="organizer-panel organizer-wide">
              <h2>Incident completion</h2>
              {incidentStats ? (
                <>
                  <div className="organizer-progress-summary">
                    <strong>{overallIncidentProgress?.resolved}/{overallIncidentProgress?.total} assigned incidents resolved</strong>
                    <progress
                      value={overallIncidentProgress?.resolved ?? 0}
                      max={Math.max(overallIncidentProgress?.total ?? 0, 1)}
                      aria-label="All sessions incident resolution progress"
                    />
                  </div>
                  <div className="organizer-stat-row">
                    <span>Assigned <strong>{incidentStats.assigned}</strong></span>
                    <span>Started <strong>{incidentStats.started}</strong></span>
                    <span>Resolved <strong>{incidentStats.resolved}</strong></span>
                    <span>Completed <strong>{incidentStats.completed}</strong></span>
                  </div>
                </>
              ) : <p>No persisted incident activity.</p>}
            </article>
            <article className="organizer-panel organizer-wide">
              <h2>Recent sessions</h2>
              {sessions.length === 0 ? <p>No sessions have been created.</p> : (
                <div className="organizer-table-wrap">
                  <table>
                    <thead><tr><th>Name</th><th>Join code</th><th>Status</th><th>Participants</th><th>Created</th></tr></thead>
                    <tbody>
                      {[...sessions].slice(0, 5).map(session => (
                        <tr key={String(session.id)}>
                          <td>{String(session.name)}</td>
                          <td><strong className="organizer-join-code">{String(session.join_code)}</strong></td>
                          <td><span className={`organizer-status ${String(session.status)}`}>{String(session.status)}</span></td>
                          <td>{String(session.participantCount)} / {String(session.max_players)}</td>
                          <td>{formatDate(session.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </div>
        )}

        {section === 'sessions' && (
          <div className="organizer-sessions-layout">
            <aside className="organizer-panel organizer-create">
              <h2>Create session</h2>
              <form onSubmit={createSession}>
                <label htmlFor="session-name">Session name</label>
                <input id="session-name" value={createName} onChange={event => setCreateName(event.target.value)} required minLength={1} maxLength={120} />
                <label htmlFor="session-capacity">Maximum participants</label>
                <input id="session-capacity" type="number" value={createCapacity} onChange={event => setCreateCapacity(Number(event.target.value))} min={1} max={200} />
                <button type="submit" disabled={busy || !createName}>Create session</button>
              </form>
              {createdLink && (
                <div className="organizer-created-link">
                  <span>Player join code</span>
                  <strong className="organizer-join-code-large">{createdJoinCode}</strong>
                  <span>Shareable join link</span>
                  <input readOnly value={createdLink} onFocus={event => event.target.select()} />
                  {createdQr && <img src={createdQr} alt="QR code for player join link" />}
                </div>
              )}
            </aside>
            <article className="organizer-panel organizer-session-list">
              <h2>Sessions</h2>
              {activeSessions.length === 0 ? <p>No unarchived sessions.</p> : (
                <div className="organizer-table-wrap">
                  <table>
                    <thead><tr><th>Name</th><th>Join code</th><th>Status</th><th>Participants</th><th>Completed</th><th>Created</th><th>Actions</th></tr></thead>
                    <tbody>
                      {activeSessions.map(session => (
                        <tr key={String(session.id)}>
                          <td>
                            <button className="organizer-link" type="button" onClick={() => selectSession(String(session.id))}>{String(session.name)}</button>
                            <small>{String(session.id)}</small>
                          </td>
                          <td><strong className="organizer-join-code">{String(session.join_code)}</strong></td>
                          <td><span className={`organizer-status ${String(session.status)}`}>{String(session.status)}</span></td>
                          <td>{String(session.participantCount)} / {String(session.max_players)}</td>
                          <td>{String(session.completionCount)}</td>
                          <td>{formatDate(session.created_at)}</td>
                          <td className="organizer-actions">
                            {session.status === 'waiting' && <button type="button" onClick={() => void changeStatus(String(session.id), 'active')} disabled={busy}>Start</button>}
                            {session.status === 'active' && <button type="button" onClick={() => void changeStatus(String(session.id), 'completed')} disabled={busy}>Complete</button>}
                            <button className="organizer-danger" type="button" onClick={() => void resetSession(String(session.id))} disabled={busy || session.status === 'waiting' && session.participantCount === 0}>Reset</button>
                            <button
                              className="organizer-danger organizer-delete-session"
                              type="button"
                              aria-label={`Delete session ${String(session.name)} (${String(session.join_code)})`}
                              onClick={() => void deleteSession(session)}
                              disabled={busy}
                            >
                              Delete session
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {archivedSessions.length > 0 && (
                <section className="organizer-archived-sessions" aria-labelledby="archived-sessions-heading">
                  <h3 id="archived-sessions-heading">Archived sessions</h3>
                  <p>Archived sessions cannot accept participants. Their join codes remain reserved and their history is retained.</p>
                  <div className="organizer-table-wrap">
                    <table>
                      <thead><tr><th>Name</th><th>Join code</th><th>Status</th><th>Participants</th><th>Completed</th><th>Created</th><th>History</th></tr></thead>
                      <tbody>
                        {archivedSessions.map(session => (
                          <tr key={String(session.id)}>
                            <td>{String(session.name)}<small>{String(session.id)}</small></td>
                            <td><strong className="organizer-join-code">{String(session.join_code)}</strong></td>
                            <td><span className="organizer-status archived">Archived</span></td>
                            <td>{String(session.participantCount)} / {String(session.max_players)}</td>
                            <td>{String(session.completionCount)}</td>
                            <td>{formatDate(session.created_at)}</td>
                            <td>
                              <button
                                className="organizer-link"
                                type="button"
                                onClick={() => viewArchivedResults(String(session.id))}
                              >
                                View results
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              {selectedSession && (
                <div className="organizer-session-details">
                  <h3>Session details</h3>
                  <span>Player join code</span>
                  <strong className="organizer-join-code-large">{selectedSessionJoinCode || 'Unavailable'}</strong>
                  {selectedSessionJoinLink && (
                    <>
                      <label htmlFor="selected-session-join-link">Player join link</label>
                      <input id="selected-session-join-link" readOnly value={selectedSessionJoinLink} onFocus={event => event.target.select()} />
                    </>
                  )}
                  <small>Internal session ID: {String(selectedSession.id)}</small>
                </div>
              )}
            </article>
          </div>
        )}

        {section === 'participants' && (
          <div className="organizer-participant-layout">
            <article className="organizer-panel">
              <div className="organizer-toolbar">
                <select value={selectedSessionId} onChange={event => void selectSession(event.target.value)}>
                  <option value="">Select a session</option>
                  {activeSessions.map(session => <option key={String(session.id)} value={String(session.id)}>{String(session.name)}</option>)}
                </select>
                <input type="search" placeholder="Search nickname" value={participantSearch} onChange={event => setParticipantSearch(event.target.value)} />
                <select value={participantSort} onChange={event => setParticipantSort(event.target.value as typeof participantSort)}>
                  <option value="joined">Newest registration</option>
                  <option value="nickname">Nickname</option>
                  <option value="status">Status</option>
                </select>
              </div>
              {selectedSessionId && (
                <div className="organizer-progress-summary organizer-session-progress">
                  <strong>Session progress: {sessionProgress.resolved}/{sessionProgress.total} assigned incidents resolved</strong>
                  <progress
                    value={sessionProgress.resolved}
                    max={Math.max(sessionProgress.total, 1)}
                    aria-label="Selected session incident resolution progress"
                  />
                </div>
              )}
              {selectedSessionId && filteredParticipants.length === 0 ? <p>No participants match this view.</p> : (
                <div className="organizer-table-wrap">
                  <table>
                    <thead><tr><th>Nickname</th><th>Participant ID</th><th>Registered</th><th>Run status</th><th>Incident progress</th><th>Result</th></tr></thead>
                    <tbody>
                      {filteredParticipants.map(participant => {
                        const run = participant.run as Record<string, unknown> | null
                        const incidents = incidentsForRun(run)
                        const resolvedCount = incidents.filter(incident => incident.status === 'resolved').length
                        return (
                          <tr key={String(participant.id)}>
                            <td><button className="organizer-link" type="button" onClick={() => void selectParticipant(String(participant.id))}>{String(participant.nickname)}</button></td>
                            <td><code>{String(participant.id)}</code></td>
                            <td>{formatDate(participant.joined_at)}</td>
                            <td>{run ? String(run.status) : String(participant.completion_status)}</td>
                            <td>
                              {run ? (
                                <div className="organizer-player-progress">
                                  <strong>{resolvedCount}/{incidents.length} incidents resolved</strong>
                                  <progress
                                    value={resolvedCount}
                                    max={Math.max(incidents.length, 1)}
                                    aria-label={`${resolvedCount} of ${incidents.length} incidents resolved for ${String(participant.nickname)}`}
                                  />
                                  <details className="organizer-incident-details">
                                    <summary>Incident statuses</summary>
                                    <ul>
                                      {incidents.map(incident => (
                                        <li key={incident.scenarioId}>
                                          <code>{incident.scenarioId}</code>
                                          <span className={`organizer-incident-status ${incident.status}`}>
                                            {incidentStatusLabel(incident.status)}
                                          </span>
                                          {incident.status === 'resolved' && incident.resolutionCorrect !== null
                                            && <small>{incident.resolutionCorrect ? 'Correct resolution' : 'Incorrect resolution'}</small>}
                                          {incident.resolvedAt && <time>{formatDate(incident.resolvedAt)}</time>}
                                        </li>
                                      ))}
                                    </ul>
                                  </details>
                                </div>
                              ) : <span>Not assigned</span>}
                            </td>
                            <td>{participant.completed_at ? 'Submitted/run completed' : 'In progress or waiting'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
            {participantDetail && (
              <aside className="organizer-panel organizer-detail">
                <h2>Participant detail</h2>
                <strong>{String((participantDetail.participant as Record<string, unknown> | undefined)?.nickname ?? '')}</strong>
                <dl>
                  <dt>Participant ID</dt><dd><code>{String((participantDetail.participant as Record<string, unknown> | undefined)?.id ?? '')}</code></dd>
                  <dt>Registered</dt><dd>{formatDate((participantDetail.participant as Record<string, unknown> | undefined)?.joined_at)}</dd>
                  <dt>Run status</dt><dd>{String((participantDetail.run as Record<string, unknown> | undefined)?.status ?? 'Not started')}</dd>
                </dl>
                <h3>Assigned order</h3>
                {((participantDetail.assignments as Array<Record<string, unknown>>) ?? []).length ? (
                  <ol>{(participantDetail.assignments as Array<Record<string, unknown>>).map(item => <li key={String(item.scenario_id)}>{String(item.scenario_id)}</li>)}</ol>
                ) : <p>No authoritative assignment yet.</p>}
                <h3>Scenario progress</h3>
                {selectedParticipantIncidents.length ? (
                  <ul className="organizer-incident-list">{selectedParticipantIncidents.map(incident =>
                    <li key={incident.scenarioId}>
                      <code>{incident.scenarioId}</code>
                      <span className={`organizer-incident-status ${incident.status}`}>
                        {incidentStatusLabel(incident.status)}
                      </span>
                      {incident.status === 'resolved' && incident.resolutionCorrect !== null
                        && <small>{incident.resolutionCorrect ? 'Correct resolution' : 'Incorrect resolution'}</small>}
                      {incident.resolvedAt && <time>Resolved {formatDate(incident.resolvedAt)}</time>}
                    </li>)}</ul>
                ) : <p>No persisted scenario progress.</p>}
                <h3>Recorded actions</h3>
                {((participantDetail.actions as Array<Record<string, unknown>>) ?? []).length ? (
                  <ul>{(participantDetail.actions as Array<Record<string, unknown>>).map(item =>
                    <li key={String(item.action_id)}>{String(item.scenario_id)} · {String(item.action_kind)} · {item.correct === null ? 'not graded' : item.correct ? 'correct' : 'incorrect'}</li>)}</ul>
                ) : <p>No incident actions recorded.</p>}
                <h3>Final result</h3>
                {participantDetail.result ? (
                  <dl>
                    <dt>Score</dt><dd>{String((participantDetail.result as Record<string, unknown>).final_score)}</dd>
                    <dt>Survival</dt><dd>{String((participantDetail.result as Record<string, unknown>).survival_rating)}</dd>
                    <dt>Duration</dt><dd>{formatDuration((participantDetail.result as Record<string, unknown>).completion_time_ms)}</dd>
                  </dl>
                ) : <p>No final result submitted.</p>}
              </aside>
            )}
          </div>
        )}

        {section === 'leaderboards' && (
          <div className="organizer-leaderboards">
            <article className="organizer-panel organizer-leaderboard-controls">
              <div className="organizer-toolbar">
                <label htmlFor="leaderboard-session">Event session</label>
                <select
                  id="leaderboard-session"
                  value={selectedSessionId}
                  onChange={event => selectSession(event.target.value)}
                >
                  <option value="">Select a session</option>
                  {activeSessions.map(session => (
                    <option key={String(session.id)} value={String(session.id)}>
                      {String(session.name)}
                    </option>
                  ))}
                </select>
              </div>
              {!selectedSessionId ? (
                <p>Select a session to view its live leaderboards.</p>
              ) : (
                <>
                  <div className="organizer-leaderboard-summary">
                    <div className="organizer-leaderboard-session">
                      <span>SESSION</span>
                      <strong>{String(selectedSession?.name ?? 'Selected session')}</strong>
                      <small>Join code: {String(selectedSession?.join_code ?? '—')}</small>
                    </div>
                    <div className="organizer-leaderboard-stat">
                      <span>Total participants</span>
                      <strong>{sessionLeaderboards.totalParticipants}</strong>
                    </div>
                    <div className="organizer-leaderboard-stat">
                      <span>Completed runs</span>
                      <strong>{sessionLeaderboards.completedRuns}</strong>
                    </div>
                    <div className="organizer-leaderboard-stat">
                      <span>In progress</span>
                      <strong>{sessionLeaderboards.inProgressParticipants}</strong>
                    </div>
                    <div className="organizer-leaderboard-stat organizer-leaderboard-progress">
                      <span>Assigned incident progress</span>
                      <strong>{sessionLeaderboards.resolvedIncidents}/{sessionLeaderboards.assignedIncidents}</strong>
                      <progress
                        value={sessionLeaderboards.resolvedIncidents}
                        max={Math.max(sessionLeaderboards.assignedIncidents, 1)}
                        aria-label="Selected session incident resolution progress"
                      />
                    </div>
                  </div>

                  <div className="organizer-leaderboard-grid">
                    <article className="organizer-panel organizer-leaderboard-panel">
                      <h2>Highest score</h2>
                      {sessionLeaderboards.highestScore.length === 0 ? (
                        <p>No participants are available for this session.</p>
                      ) : (
                        <div className="organizer-table-wrap">
                          <table>
                            <thead>
                              <tr><th>Rank</th><th>Nickname</th><th>Points</th><th>Incidents resolved</th><th>Run status</th></tr>
                            </thead>
                            <tbody>
                              {sessionLeaderboards.highestScore.map(entry => (
                                <tr key={entry.playerId}>
                                  <td>
                                    <span className={`organizer-rank organizer-rank-${entry.rank <= 3 ? entry.rank : 'other'}`}>
                                      {entry.rank}
                                    </span>
                                  </td>
                                  <td>{entry.nickname}</td>
                                  <td><strong>{entry.score}</strong></td>
                                  <td>
                                    <div className="organizer-leaderboard-incidents">
                                      <strong>{entry.resolvedIncidents}/{entry.assignedIncidents}</strong>
                                      <progress
                                        value={entry.resolvedIncidents}
                                        max={Math.max(entry.assignedIncidents, 1)}
                                        aria-label={`${entry.resolvedIncidents} of ${entry.assignedIncidents} incidents resolved for ${entry.nickname}`}
                                      />
                                      <details className="organizer-incident-details">
                                        <summary>Incident statuses</summary>
                                        <ul>
                                          {entry.incidents.map(incident => (
                                            <li key={incident.scenarioId}>
                                              <code>{incident.scenarioId}</code>
                                              <span className={`organizer-incident-status ${incident.status}`}>
                                                {incidentStatusLabel(incident.status)}
                                              </span>
                                              {incident.status === 'resolved' && incident.resolutionCorrect !== null
                                                && <small>{incident.resolutionCorrect ? 'Correct resolution' : 'Incorrect resolution'}</small>}
                                              {incident.resolvedAt && <time>{formatDate(incident.resolvedAt)}</time>}
                                            </li>
                                          ))}
                                        </ul>
                                      </details>
                                    </div>
                                  </td>
                                  <td>
                                    <span className={`organizer-leaderboard-run-status ${entry.runStatus.toLowerCase().replace(/\s+/g, '-')}`}>
                                      {entry.runStatus}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </article>

                    <article className="organizer-panel organizer-leaderboard-panel">
                      <h2>Fastest completion</h2>
                      {sessionLeaderboards.fastestCompletion.length === 0 ? (
                        <p>No valid five-incident completions yet.</p>
                      ) : (
                        <div className="organizer-table-wrap">
                          <table>
                            <thead>
                              <tr><th>Rank</th><th>Nickname</th><th>Final score</th><th>Completed</th><th>Elapsed</th></tr>
                            </thead>
                            <tbody>
                              {sessionLeaderboards.fastestCompletion.map(entry => (
                                <tr key={entry.playerId}>
                                  <td>
                                    <span className={`organizer-rank organizer-rank-${entry.rank <= 3 ? entry.rank : 'other'}`}>
                                      {entry.rank}
                                    </span>
                                  </td>
                                  <td>{entry.nickname}</td>
                                  <td><strong>{entry.finalScore}</strong></td>
                                  <td>
                                    {entry.completedAt
                                      ? <time dateTime={entry.completedAt}>{formatDate(entry.completedAt)}</time>
                                      : '—'}
                                  </td>
                                  <td>{formatDuration(entry.elapsedDurationMs)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </article>
                  </div>
                </>
              )}
            </article>
          </div>
        )}

        {section === 'analytics' && (
          <article className="organizer-panel">
            <div className="organizer-toolbar">
              <select value={sessionFilter} onChange={event => {
                setSessionFilter(event.target.value)
              }}>
                <option value="">All sessions</option>
                {sessions.map(session => <option key={String(session.id)} value={String(session.id)}>{`${String(session.name)}${session.status === 'archived' ? ' (Archived)' : ''}`}</option>)}
              </select>
            </div>
            {analytics.length === 0 ? <p>No assigned scenarios are available for this view.</p> : (
              <div className="organizer-table-wrap">
                <table>
                  <thead><tr><th>Scenario</th><th>Assignments</th><th>Started</th><th>Completed</th><th>Correctly resolved</th><th>Incorrect actions</th><th>Completion</th><th>Average impact</th></tr></thead>
                  <tbody>
                    {analytics.map(row => (
                      <tr key={String(row.scenarioId)}>
                        <td><code>{String(row.scenarioId)}</code></td>
                        <td>{String(row.assignments)}</td>
                        <td>{String(row.started)}</td>
                        <td>{String(row.completed)}</td>
                        <td>{String(row.resolvedCorrectly)}</td>
                        <td>{String(row.incorrectActions)}</td>
                        <td>{Number(row.completionPercentage).toFixed(1)}%</td>
                        <td>{typeof row.averageScoreImpact === 'number' ? Number(row.averageScoreImpact).toFixed(1) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        )}

        {section === 'results' && (
          <article className="organizer-panel">
            <div className="organizer-toolbar">
              <select value={sessionFilter} onChange={event => {
                setSessionFilter(event.target.value)
              }}>
                <option value="">All sessions</option>
                {sessions.map(session => <option key={String(session.id)} value={String(session.id)}>{`${String(session.name)}${session.status === 'archived' ? ' (Archived)' : ''}`}</option>)}
              </select>
              <button type="button" onClick={() => void downloadCsv()} disabled={results.length === 0}>Export CSV</button>
            </div>
            {results.length === 0 ? <p>No completed results have been submitted.</p> : (
              <div className="organizer-table-wrap">
                <table>
                  <thead><tr><th>Rank</th><th>Participant</th><th>Score</th><th>Correct resolutions</th><th>Incorrect actions</th><th>Evidence</th><th>Duration</th><th>Survival</th></tr></thead>
                  <tbody>
                    {results.map((row, index) => (
                      <tr key={String(row.playerId)}>
                        <td>{index + 1}</td>
                        <td>{String(row.nickname)}</td>
                        <td><strong>{String(row.final_score)}</strong></td>
                        <td>{String(row.correct_resolutions)}</td>
                        <td>{String(row.incorrect_actions)}</td>
                        <td>{String(row.evidence_collected)}</td>
                        <td>{formatDuration(row.completion_time_ms)}</td>
                        <td>{String(row.survival_rating)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        )}
      </section>
    </main>
  )
}
