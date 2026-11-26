export type IncidentStatus = 'unresolved' | 'in-progress' | 'resolved'

export interface ParticipantIncidentProgress {
  scenarioId: string
  ordinal: number
  status: IncidentStatus
  resolvedAt: string | null
  resolutionCorrect: boolean | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function participantIncidentProgress(
  runId: string,
  scenarioIds: unknown,
  progressRows: unknown,
): ParticipantIncidentProgress[] {
  if (!Array.isArray(scenarioIds)) return []

  const rowsByScenario = new Map<string, Record<string, unknown>>()
  if (Array.isArray(progressRows)) {
    for (const row of progressRows) {
      if (
        isRecord(row)
        && row.run_id === runId
        && typeof row.scenario_id === 'string'
      ) {
        rowsByScenario.set(row.scenario_id, row)
      }
    }
  }

  return scenarioIds.flatMap((scenarioId, index) => {
    if (typeof scenarioId !== 'string') return []
    const row = rowsByScenario.get(scenarioId)
    const state = typeof row?.state === 'string' ? row.state : 'assigned'
    const resolvedAt = typeof row?.resolved_at === 'string' && row.resolved_at
      ? row.resolved_at
      : null
    const resolved = ['resolved', 'completed'].includes(state)
    const inProgress = ['delivered', 'investigating'].includes(state)

    return [{
      scenarioId,
      ordinal: index + 1,
      status: resolved ? 'resolved' : inProgress ? 'in-progress' : 'unresolved',
      resolvedAt: resolved ? resolvedAt : null,
      resolutionCorrect: typeof row?.resolution_correct === 'boolean' ? row.resolution_correct : null,
    }]
  })
}

export function summarizeIncidentProgress(
  participants: readonly (readonly ParticipantIncidentProgress[])[],
): { resolved: number; total: number } {
  let resolved = 0
  let total = 0
  for (const incidents of participants) {
    total += incidents.length
    resolved += incidents.filter(incident => incident.status === 'resolved').length
  }
  return { resolved, total }
}
