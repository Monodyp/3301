import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameState } from '../game/types.ts'
import {
  getParticipantRun,
  saveParticipantRunProgress,
  submitParticipantFiveScenarioResult,
} from './api.ts'
import {
  loadStoredParticipant,
  saveStoredParticipant,
} from './participant.ts'
import {
  participantCompletionTimeMs,
  participantDecisionRecords,
  participantRunProgress,
} from './progress.ts'

export function useParticipantRunSync(state: GameState, enabled: boolean) {
  const [retryVersion, setRetryVersion] = useState(0)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const lastSaved = useRef('')
  const submittedRunId = useRef<string | null>(null)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const persistedRunId = useRef<string | null>(null)
  const persistedResolvedScenarios = useRef<Set<string>>(new Set())

  const progressSnapshot = useMemo(() => {
    if (!enabled || state.runMode !== 'event' || !state.eventRunId || state.phase === 'MAIN_MENU') return null
    try {
      const progress = participantRunProgress(state)
      return { progress, serialized: JSON.stringify(progress) }
    } catch (reason) {
      return { error: reason instanceof Error ? reason.message : 'Event progress is invalid.' }
    }
  }, [enabled, state])

  const retry = useCallback(() => setRetryVersion(version => version + 1), [])

  useEffect(() => {
    if (!enabled || state.runMode !== 'event' || !state.eventRunId || state.phase === 'MAIN_MENU') return
    const participant = loadStoredParticipant()
    if (!participant?.playerId) return
    if (!progressSnapshot || 'error' in progressSnapshot) return
    const { progress, serialized } = progressSnapshot
    if (persistedRunId.current !== state.eventRunId) {
      persistedRunId.current = state.eventRunId
      persistedResolvedScenarios.current = new Set()
    }
    const resolvedScenarioIds = progress.scenarios
      .filter(scenario => scenario.state === 'resolved' || scenario.state === 'completed')
      .map(scenario => scenario.scenarioId)
    const hasUnpersistedResolution = resolvedScenarioIds.some(
      scenarioId => !persistedResolvedScenarios.current.has(scenarioId),
    )

    const savedKey = `${state.eventRunId}:${serialized}`
    if (state.phase === 'RESULTS') {
      if (submittedRunId.current === state.eventRunId) return
      submittedRunId.current = state.eventRunId
      setStatus('saving')
      setError(null)
      void (async () => {
        await saveQueue.current
        if (participant.completionStatus !== 'completed') {
          await saveParticipantRunProgress(participant, progress)
          lastSaved.current = savedKey
          if (persistedRunId.current === state.eventRunId) {
            for (const scenarioId of resolvedScenarioIds) persistedResolvedScenarios.current.add(scenarioId)
          }
          try {
            await submitParticipantFiveScenarioResult(
              participant,
              participantDecisionRecords(state),
              participantCompletionTimeMs(state),
            )
          } catch (reason) {
            if (!(reason instanceof Error) || !/duplicate_five_scenario_result|player_completed/i.test(reason.message)) throw reason
            const remoteRun = await getParticipantRun(participant)
            if (remoteRun.status !== 'completed') throw reason
          }
          saveStoredParticipant({ ...participant, completionStatus: 'completed', eventRunStarted: true })
        }
        setStatus('saved')
      })().catch(reason => {
        submittedRunId.current = null
        setStatus('error')
        setError(reason instanceof Error ? reason.message : 'Could not submit event results.')
      })
      return
    }

    if (lastSaved.current === savedKey) return
    const timer = window.setTimeout(() => {
      saveQueue.current = saveQueue.current.then(async () => {
        if (lastSaved.current === savedKey) return
        setStatus('saving')
        await saveParticipantRunProgress(participant, progress)
        lastSaved.current = savedKey
        if (persistedRunId.current === state.eventRunId) {
          for (const scenarioId of resolvedScenarioIds) persistedResolvedScenarios.current.add(scenarioId)
        }
        setStatus('saved')
        setError(null)
      }).catch(reason => {
        setStatus('error')
        setError(reason instanceof Error ? reason.message : 'Could not save event progress.')
      })
    }, hasUnpersistedResolution ? 0 : 250)
    return () => window.clearTimeout(timer)
  }, [enabled, progressSnapshot, retryVersion, state])

  const progressError = progressSnapshot && 'error' in progressSnapshot ? progressSnapshot.error : null
  return { status: progressError ? 'error' : status, error: progressError ?? error, retry }
}
