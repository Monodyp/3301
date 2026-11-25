import { useEffect, useMemo, useState, type FormEvent } from 'react'
import QRCode from 'qrcode'
import '../../styles/organizer.css'
import {
  adminLogin,
  adminLogout,
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

type Section = 'overview' | 'sessions' | 'participants' | 'analytics' | 'results'

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
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [createName, setCreateName] = useState('')
  const [createCapacity, setCreateCapacity] = useState(60)
  const [createdJoinCode, setCreatedJoinCode] = useState('')
  const [createdLink, setCreatedLink] = useState('')
  const [createdQr, setCreatedQr] = useState('')

  const refresh = async () => {
    if (!loggedIn) return
    setBusy(true)
    try {
      const [overviewResponse, sessionResponse] = await Promise.all([
        getAdminOverview(),
        getAdminSessions(),
      ])
      setOverview(overviewResponse)
      setSessions(sessionResponse.sessions)
      setLastRefresh(new Date())
      if (selectedSessionId) {
        await loadSessionData(selectedSessionId)
      }
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Could not refresh organizer data.')
      if (/login|required|unauthorized/i.test(error instanceof Error ? error.message : '')) {
        clearAdminSessionToken()
        setLoggedIn(false)
      }
    } finally {
      setBusy(false)
    }
  }

  const loadSessionData = async (sessionId: string) => {
    const [participantResponse, analyticsResponse, resultResponse] = await Promise.all([
      getAdminParticipants(sessionId),
      getIncidentAnalytics(sessionId),
      getAdminResults(sessionId),
    ])
    setParticipants(participantResponse.participants)
    setAnalytics(analyticsResponse.scenarios)
    setResults(resultResponse.results)
  }

  useEffect(() => {
    if (!loggedIn) return
    void refresh()
    const interval = window.setInterval(() => void refresh(), 15000)
    return () => window.clearInterval(interval)
  }, [loggedIn, selectedSessionId])

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

  const selectSession = async (sessionId: string) => {
    setSelectedSessionId(sessionId)
    setParticipantDetail(null)
    try {
      await loadSessionData(sessionId)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load session.')
    }
  }

  const selectParticipant = async (playerId: string) => {
    if (!selectedSessionId) return
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
  const selectedSession = sessions.find(session => String(session.id) === selectedSessionId)
  const selectedSessionJoinCode = typeof selectedSession?.join_code === 'string' ? selectedSession.join_code : ''
  const selectedSessionJoinLink = normalizeJoinCode(selectedSessionJoinCode)
    ? playerJoinUrl(window.location.origin, selectedSessionJoinCode)
    : ''

  return (
    <main className="organizer-shell">
      <aside className="organizer-sidebar">
        <div className="organizer-brand">3301 · ORGANIZER</div>
        <nav aria-label="Organizer sections">
          {([
            ['overview', 'Overview'],
            ['sessions', 'Sessions'],
            ['participants', 'Participants'],
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
            <h1>{section === 'overview' ? 'Overview' : section === 'sessions' ? 'Sessions' : section === 'participants' ? 'Participants' : section === 'analytics' ? 'Incident Analytics' : 'Results and Leaderboard'}</h1>
          </div>
          <div className="organizer-refresh">
            <span>{busy ? 'Refreshing…' : lastRefresh ? `Last refreshed ${lastRefresh.toLocaleTimeString()}` : 'Not refreshed'}</span>
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
                <div className="organizer-stat-row">
                  <span>Assigned <strong>{incidentStats.assigned}</strong></span>
                  <span>Started <strong>{incidentStats.started}</strong></span>
                  <span>Resolved <strong>{incidentStats.resolved}</strong></span>
                  <span>Completed <strong>{incidentStats.completed}</strong></span>
                </div>
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
              <h2>All sessions</h2>
              {sessions.length === 0 ? <p>No sessions have been created.</p> : (
                <div className="organizer-table-wrap">
                  <table>
                    <thead><tr><th>Name</th><th>Join code</th><th>Status</th><th>Participants</th><th>Completed</th><th>Created</th><th>Actions</th></tr></thead>
                    <tbody>
                      {sessions.map(session => (
                        <tr key={String(session.id)}>
                          <td>
                            <button className="organizer-link" type="button" onClick={() => void selectSession(String(session.id))}>{String(session.name)}</button>
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
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
                  {sessions.map(session => <option key={String(session.id)} value={String(session.id)}>{String(session.name)}</option>)}
                </select>
                <input type="search" placeholder="Search nickname" value={participantSearch} onChange={event => setParticipantSearch(event.target.value)} />
                <select value={participantSort} onChange={event => setParticipantSort(event.target.value as typeof participantSort)}>
                  <option value="joined">Newest registration</option>
                  <option value="nickname">Nickname</option>
                  <option value="status">Status</option>
                </select>
              </div>
              {selectedSessionId && filteredParticipants.length === 0 ? <p>No participants match this view.</p> : (
                <div className="organizer-table-wrap">
                  <table>
                    <thead><tr><th>Nickname</th><th>Participant ID</th><th>Registered</th><th>Run status</th><th>Result</th></tr></thead>
                    <tbody>
                      {filteredParticipants.map(participant => {
                        const run = participant.run as Record<string, unknown> | null
                        return (
                          <tr key={String(participant.id)}>
                            <td><button className="organizer-link" type="button" onClick={() => void selectParticipant(String(participant.id))}>{String(participant.nickname)}</button></td>
                            <td><code>{String(participant.id)}</code></td>
                            <td>{formatDate(participant.joined_at)}</td>
                            <td>{run ? String(run.status) : String(participant.completion_status)}</td>
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
                {((participantDetail.progress as Array<Record<string, unknown>>) ?? []).length ? (
                  <ul>{(participantDetail.progress as Array<Record<string, unknown>>).map(item =>
                    <li key={String(item.scenario_id)}>{String(item.scenario_id)} · {String(item.state)} · evidence {(item.evidence as unknown[] | undefined)?.length ?? 0}</li>)}</ul>
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

        {section === 'analytics' && (
          <article className="organizer-panel">
            <div className="organizer-toolbar">
              <select value={sessionFilter} onChange={event => {
                const value = event.target.value
                setSessionFilter(value)
                void getIncidentAnalytics(value || undefined).then(response => setAnalytics(response.scenarios)).catch(error => setNotice(error instanceof Error ? error.message : 'Could not load analytics'))
              }}>
                <option value="">All sessions</option>
                {sessions.map(session => <option key={String(session.id)} value={String(session.id)}>{String(session.name)}</option>)}
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
                const value = event.target.value
                setSessionFilter(value)
                void getAdminResults(value || undefined).then(response => setResults(response.results)).catch(error => setNotice(error instanceof Error ? error.message : 'Could not load results'))
              }}>
                <option value="">All sessions</option>
                {sessions.map(session => <option key={String(session.id)} value={String(session.id)}>{String(session.name)}</option>)}
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
