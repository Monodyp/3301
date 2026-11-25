// Saves the run to localStorage so a browser refresh restores it exactly.
// Only "Play again" (or the dev reset) starts a new run.
// Storage can be missing or full on some phones, so every call is wrapped.
//
// A restored run is re-checked by reconcileNarrative(): a pending or open
// decision that is not valid any more is cleared rather than shown, so an
// edited save cannot expose a future decision or submit one twice.

import type { GameState, NarrativeState } from './types.ts'
import { SAVE_VERSION, initialGameState } from './engine.ts'
import { getCharacter } from './content/index.ts'
import { reconcileNarrative } from './narrative.ts'
import { reconcileAttacks } from './attacks.ts'
import { getScenarioDefinition, isScenarioId, validateScenarioAssignment } from './scenarioRegistry.ts'

export const SAVE_KEY = '3301.run'
export const EVENT_SAVE_KEY = '3301.event-run'

export type RunStorageMode = 'practice' | 'event'

type LegacyPracticeSave = Omit<GameState, 'saveVersion' | 'runMode' | 'eventRunId' | 'resolutionSteps' | 'performedPhoneInteractions' | 'corruptionByScenario' | 'resolutionActionFeedback'> & {
  saveVersion: 3
}

type LegacyVersion4Save = Omit<GameState, 'saveVersion' | 'resolutionSteps' | 'performedPhoneInteractions' | 'corruptionByScenario' | 'resolutionActionFeedback'> & {
  saveVersion: 4
}

type LegacyVersion5Save = Omit<GameState, 'saveVersion' | 'performedPhoneInteractions' | 'corruptionByScenario'> & {
  saveVersion: 5
}

type LoadStorage = Pick<Storage, 'getItem'> & Partial<Pick<Storage, 'removeItem'>>

export function loadGame(
  storage: LoadStorage | undefined = safeStorage(),
  mode: RunStorageMode = 'practice',
): GameState {
  try {
    const raw = storage?.getItem(saveKeyForMode(mode))
    if (!raw) return initialGameState()
    let parsed: unknown = JSON.parse(raw)
    if (mode === 'practice' && isLegacyPracticeSave(parsed)) {
      parsed = {
        ...parsed,
        saveVersion: SAVE_VERSION,
        runMode: 'practice',
        eventRunId: null,
        resolutionSteps: {},
        performedPhoneInteractions: {},
        corruptionByScenario: {},
        resolutionActionFeedback: null,
      }
    } else if (isLegacyVersion5Save(parsed)) {
      parsed = { ...parsed, saveVersion: SAVE_VERSION, performedPhoneInteractions: {}, corruptionByScenario: {} }
    } else if (isLegacyVersion4Save(parsed)) {
      parsed = {
        ...parsed,
        saveVersion: SAVE_VERSION,
        resolutionSteps: {},
        performedPhoneInteractions: {},
        corruptionByScenario: {},
        resolutionActionFeedback: null,
      }
    }
    if (!isUsableSave(parsed) || parsed.runMode !== mode) {
      discardSave(storage, mode)
      return initialGameState()
    }
    // Viewing timers never survive a refresh: time away from the page does not count.
    const { notifiedAttackIds: _legacy, ...save } = parsed as GameState & { notifiedAttackIds?: unknown }
    void _legacy
    const restored = reconcileNarrative({ ...initialGameState(), ...save, clueViewing: {} })
    return reconcileAttacks(restored, isAttackProgress(parsed.attacks))
  } catch {
    discardSave(storage, mode)
    return initialGameState()
  }
}

export function saveGame(state: GameState, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  try {
    const mode = state.runMode === 'event' ? 'event' : 'practice'
    storage?.setItem(saveKeyForMode(mode), JSON.stringify(state))
  } catch {
    // Storage full or blocked: the run keeps going, it just won't survive a refresh.
  }
}

export function clearSave(
  storage: Pick<Storage, 'removeItem'> | undefined = safeStorage(),
  mode: RunStorageMode = 'practice',
): void {
  try {
    storage?.removeItem(saveKeyForMode(mode))
  } catch {
    // ignore
  }
}

function saveKeyForMode(mode: RunStorageMode): string {
  return mode === 'event' ? EVENT_SAVE_KEY : SAVE_KEY
}

function discardSave(storage: LoadStorage | undefined, mode: RunStorageMode): void {
  try {
    storage?.removeItem?.(saveKeyForMode(mode))
  } catch {
    // ignore
  }
}

// Version 3 saves are accepted only as complete local-practice runs. Event
// runs must always be reconstructed from their current backend assignment.
function isLegacyPracticeSave(value: unknown): value is LegacyPracticeSave {
  if (!isRecord(value)) return false
  const save = value as Partial<GameState> & { saveVersion?: unknown }
  if (save.saveVersion !== 3 || save.runMode !== undefined || save.eventRunId !== undefined) return false
  const character = getCharacter(save.characterId ?? null)
  if (!character || !isStringArray(save.encounterQueue)) return false
  const ids = new Set(character.encounters.map(encounter => encounter.id))
  return save.encounterQueue.length === 8
    && new Set(save.encounterQueue).size === 8
    && save.encounterQueue.every(id => ids.has(id))
    && isNarrativeState(save.narrative)
}

function isLegacyVersion4Save(value: unknown): value is LegacyVersion4Save {
  if (!isRecord(value)) return false
  const save = value as Partial<GameState> & { saveVersion?: unknown }
  return save.saveVersion === 4
    && save.resolutionSteps === undefined
    && save.resolutionActionFeedback === undefined
}

function isLegacyVersion5Save(value: unknown): value is LegacyVersion5Save {
  if (!isRecord(value)) return false
  const save = value as Partial<GameState> & { saveVersion?: unknown }
  return save.saveVersion === 5
    && save.performedPhoneInteractions === undefined
    && save.corruptionByScenario === undefined
}

// Invalid or obsolete saves are discarded rather than treated as assignments.
function isUsableSave(value: unknown): value is GameState {
  if (!isRecord(value)) return false
  const save = value as Partial<GameState>
  if (save.saveVersion !== SAVE_VERSION) return false
  if (typeof save.phase !== 'string') return false
  if (save.phase === 'MAIN_MENU') return save.runMode === null && save.eventRunId === null
  if (!isStringArray(save.encounterQueue) || new Set(save.encounterQueue).size !== save.encounterQueue.length) return false
  if (!isNarrativeState(save.narrative)) return false
  if (!isResolutionSteps(save.resolutionSteps, save.encounterQueue)) return false
  if (!isPhoneInteractionProgress(save.performedPhoneInteractions, save.encounterQueue)) return false
  if (!isCorruptionProgress(save.corruptionByScenario, save.encounterQueue)) return false
  if (!isResolutionActionFeedback(save.resolutionActionFeedback)) return false

  if (save.runMode === 'practice') {
    const character = getCharacter(save.characterId ?? null)
    if (!character || save.eventRunId !== null || Object.keys(save.resolutionSteps).length > 0) return false
    const ids = new Set(character.encounters.map(encounter => encounter.id))
    return save.encounterQueue.length === 8 && save.encounterQueue.every(id => ids.has(id))
  }

  if (save.runMode === 'event') {
    return save.characterId === null
      && typeof save.eventRunId === 'string'
      && Boolean(save.eventRunId.trim())
      && validateScenarioAssignment(save.encounterQueue).ok
  }

  return false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function isResolutionSteps(value: unknown, encounterQueue: readonly string[]): value is Record<string, string[]> {
  if (!isRecord(value)) return false
  return Object.entries(value).every(([scenarioId, completed]) => {
    if (!isScenarioId(scenarioId) || !encounterQueue.includes(scenarioId) || !isStringArray(completed)) return false
    const entry = getScenarioDefinition(scenarioId)
    if (!entry || completed.length > entry.action.steps.length) return false
    return completed.every((stepId, index) => entry.action.steps[index]?.id === stepId)
  })
}

function isPhoneInteractionProgress(value: unknown, encounterQueue: readonly string[]): value is Record<string, string[]> {
  if (!isRecord(value)) return false
  return Object.entries(value).every(([scenarioId, completed]) => {
    if (!isScenarioId(scenarioId) || !encounterQueue.includes(scenarioId) || !isStringArray(completed)) return false
    const entry = getScenarioDefinition(scenarioId)
    if (!entry || completed.length > entry.action.interactions.length) return false
    const ids = new Set(entry.action.interactions.map(interaction => interaction.id))
    return completed.every(id => ids.has(id)) && new Set(completed).size === completed.length
  })
}

function isCorruptionProgress(value: unknown, encounterQueue: readonly string[]): value is Record<string, number> {
  if (!isRecord(value)) return false
  return Object.entries(value).every(([scenarioId, level]) =>
    isScenarioId(scenarioId)
    && encounterQueue.includes(scenarioId)
    && typeof level === 'number'
    && Number.isInteger(level)
    && level >= 0
    && level <= 4,
  )
}

function isResolutionActionFeedback(value: unknown): boolean {
  if (value === null) return true
  if (!isRecord(value) || typeof value.scenarioId !== 'string' || !isScenarioId(value.scenarioId)) return false
  if (typeof value.actionId !== 'string' || typeof value.stepId !== 'string' || typeof value.message !== 'string') return false
  if (value.corruptionLevel !== undefined && (
    typeof value.corruptionLevel !== 'number'
    || !Number.isInteger(value.corruptionLevel)
    || value.corruptionLevel < 0
    || value.corruptionLevel > 4
  )) return false
  if (value.outcome !== 'step-completed' && value.outcome !== 'resolved' && value.outcome !== 'rejected') return false
  const entry = getScenarioDefinition(value.scenarioId)
  return entry?.action.id === value.actionId && entry.action.steps.some(step => step.id === value.stepId)
}

function isAttackProgress(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const a = value as Record<string, unknown>
  return Array.isArray(a.triggered) && Array.isArray(a.resolved) && Array.isArray(a.notified)
}

function isNarrativeState(value: unknown): value is NarrativeState {
  if (typeof value !== 'object' || value === null) return false
  const n = value as NarrativeState
  const isRecord = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v)
  return isRecord(n.encounterLifecycle)
    && isRecord(n.scenarioLifecycle)
    && isRecord(n.completedActions)
    && isRecord(n.encounterResolution)
    && Array.isArray(n.presentedNarrative)
    && Array.isArray(n.submittedDecisionIds)
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}
