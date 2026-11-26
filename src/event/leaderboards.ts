import {
  participantIncidentProgress,
  type ParticipantIncidentProgress,
} from './adminProgress.ts'

interface LeaderboardEntry {
  playerId: string
  nickname: string
  score: number
  resolvedIncidents: number
  assignedIncidents: number
  runStatus: string
  incidents: ParticipantIncidentProgress[]
  successfullyCompleted: boolean
  completedAt: string | null
}

export interface ScoreLeaderboardEntry extends LeaderboardEntry {
  rank: number
}

export interface FastestCompletionEntry extends LeaderboardEntry {
  rank: number
  finalScore: number
  elapsedDurationMs: number
}

export interface SessionLeaderboards {
  totalParticipants: number
  completedRuns: number
  inProgressParticipants: number
  resolvedIncidents: number
  assignedIncidents: number
  highestScore: ScoreLeaderboardEntry[]
  fastestCompletion: FastestCompletionEntry[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function validTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  return Number.isFinite(Date.parse(value)) ? value : null
}

function compareEntries<T extends LeaderboardEntry>(left: T, right: T): number {
  return left.nickname.localeCompare(right.nickname) || left.playerId.localeCompare(right.playerId)
}

function rankEntries<T extends LeaderboardEntry>(
  entries: T[],
  compare: (left: T, right: T) => number,
): Array<T & { rank: number }> {
  const sorted = [...entries].sort((left, right) => compare(left, right) || compareEntries(left, right))
  let rank = 0
  return sorted.map((entry, index) => {
    if (index === 0 || compare(sorted[index - 1]!, entry) !== 0) rank = index + 1
    return { ...entry, rank }
  })
}

function rankScoreEntries(entries: Array<LeaderboardEntry & { finalScore: number | null; elapsedDurationMs: number | null }>) {
  const compareScoreAndProgress = (left: LeaderboardEntry, right: LeaderboardEntry) =>
    right.score - left.score || right.resolvedIncidents - left.resolvedIncidents
  const sorted = [...entries].sort((left, right) =>
    compareScoreAndProgress(left, right) || compareEntries(left, right),
  )
  const ranked: Array<typeof entries[number] & { rank: number }> = []

  for (let start = 0; start < sorted.length;) {
    let end = start + 1
    while (
      end < sorted.length
      && compareScoreAndProgress(sorted[start]!, sorted[end]!) === 0
    ) {
      end += 1
    }

    const group = sorted.slice(start, end)
    if (group.every(entry => entry.completedAt !== null)) {
      group.sort((left, right) =>
        Date.parse(left.completedAt!) - Date.parse(right.completedAt!)
        || compareEntries(left, right),
      )
      let groupRank = start + 1
      group.forEach((entry, index) => {
        if (
          index > 0
          && Date.parse(group[index - 1]!.completedAt!)
            !== Date.parse(entry.completedAt!)
        ) {
          groupRank = start + index + 1
        }
        ranked.push({ ...entry, rank: groupRank })
      })
    } else {
      group.forEach(entry => ranked.push({ ...entry, rank: start + 1 }))
    }
    start = end
  }

  return ranked
}

export function buildSessionLeaderboards(
  sessionId: string,
  participants: unknown,
  results: unknown,
): SessionLeaderboards {
  const empty: SessionLeaderboards = {
    totalParticipants: 0,
    completedRuns: 0,
    inProgressParticipants: 0,
    resolvedIncidents: 0,
    assignedIncidents: 0,
    highestScore: [],
    fastestCompletion: [],
  }
  if (!sessionId || !Array.isArray(participants)) return empty

  const resultsByRun = new Map<string, Record<string, unknown>>()
  if (Array.isArray(results)) {
    for (const result of results) {
      if (
        isRecord(result)
        && result.sessionId === sessionId
        && typeof result.run_id === 'string'
      ) {
        resultsByRun.set(result.run_id, result)
      }
    }
  }

  const sessionParticipants = participants.filter((participant): participant is Record<string, unknown> & { id: string } =>
    isRecord(participant)
    && participant.session_id === sessionId
    && typeof participant.id === 'string',
  )

  const scoreEntries: Array<LeaderboardEntry & { finalScore: number | null; elapsedDurationMs: number | null }> = []
  let resolvedIncidents = 0
  let assignedIncidents = 0
  let completedRuns = 0
  let inProgressParticipants = 0

  for (const participant of sessionParticipants) {
    const run = isRecord(participant.run) ? participant.run : null
    const runId = typeof run?.id === 'string' ? run.id : null
    const result = runId ? resultsByRun.get(runId) : undefined
    const incidents = runId
      ? participantIncidentProgress(runId, run?.scenarioIds, run?.incidentProgress)
      : []
    const resolvedCount = incidents.filter(incident => incident.status === 'resolved').length
    const hasFiveAssignments = incidents.length === 5
      && new Set(incidents.map(incident => incident.scenarioId)).size === 5
    const resultScore = finiteNumber(result?.final_score)
    const progress = isRecord(run?.progress) ? run.progress : null
    const score = resultScore ?? finiteNumber(progress?.totalScore) ?? 0
    const allFiveResolved = hasFiveAssignments && resolvedCount === 5
    const successfullyCompleted = run?.status === 'completed'
      && allFiveResolved
      && result?.correct_resolutions === 5
    const completedAt = run?.status === 'completed' ? validTimestamp(participant.completed_at) : null
    const startedAt = validTimestamp(run?.started_at)
    const elapsedDurationMs = startedAt && completedAt
      ? Date.parse(completedAt) - Date.parse(startedAt)
      : null
    const validElapsedDuration = elapsedDurationMs !== null && elapsedDurationMs >= 0
      ? elapsedDurationMs
      : null
    const status = run?.status
    const runStatus = !run
      ? 'Not started'
      : status === 'completed'
        ? successfullyCompleted ? 'Completed' : 'Submitted'
        : status === 'in_progress'
          ? 'In progress'
          : status === 'assigned'
            ? 'Assigned'
            : 'Unknown'

    resolvedIncidents += resolvedCount
    assignedIncidents += incidents.length
    if (successfullyCompleted) completedRuns += 1
    if (status === 'in_progress') inProgressParticipants += 1
    scoreEntries.push({
      playerId: participant.id,
      nickname: typeof participant.nickname === 'string' ? participant.nickname : 'Unknown',
      score,
      resolvedIncidents: resolvedCount,
      assignedIncidents: incidents.length,
      runStatus,
      incidents,
      successfullyCompleted,
      completedAt,
      finalScore: resultScore,
      elapsedDurationMs: validElapsedDuration,
    })
  }

  const highestScore = rankScoreEntries(scoreEntries)

  const fastestCompletion = rankEntries(
    scoreEntries.flatMap(entry => (
      entry.successfullyCompleted
      && entry.finalScore !== null
      && entry.elapsedDurationMs !== null
        ? [{
          ...entry,
          finalScore: entry.finalScore,
          elapsedDurationMs: entry.elapsedDurationMs,
        }]
        : []
    )),
    (left, right) =>
      left.elapsedDurationMs - right.elapsedDurationMs
      || right.finalScore - left.finalScore
      || Date.parse(left.completedAt ?? '') - Date.parse(right.completedAt ?? ''),
  )

  return {
    totalParticipants: sessionParticipants.length,
    completedRuns,
    inProgressParticipants,
    resolvedIncidents,
    assignedIncidents,
    highestScore,
    fastestCompletion,
  }
}
