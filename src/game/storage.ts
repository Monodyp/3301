// Saves the run to localStorage so a browser refresh restores it exactly.
// Only "Play again" (or the dev reset) starts a new run.
// Storage can be missing or full on some phones, so every call is wrapped.

import type { GameState } from './types.ts'
import { SAVE_VERSION, initialGameState } from './engine.ts'
import { getCharacter } from './content/index.ts'

export const SAVE_KEY = '3301.run'

export function loadGame(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): GameState {
  try {
    const raw = storage?.getItem(SAVE_KEY)
    if (!raw) return initialGameState()
    const parsed = JSON.parse(raw) as Partial<GameState>
    if (!isUsableSave(parsed)) return initialGameState()
    return { ...initialGameState(), ...parsed }
  } catch {
    return initialGameState()
  }
}

export function saveGame(state: GameState, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or blocked: the run keeps going, it just won't survive a refresh.
  }
}

export function clearSave(storage: Pick<Storage, 'removeItem'> | undefined = safeStorage()): void {
  try {
    storage?.removeItem(SAVE_KEY)
  } catch {
    // ignore
  }
}

// A save from an older version, or one that points at content that no longer
// exists (a renamed character or encounter), is dropped instead of crashing.
function isUsableSave(save: Partial<GameState>): save is GameState {
  if (save.saveVersion !== SAVE_VERSION) return false
  if (typeof save.phase !== 'string') return false
  if (save.phase === 'MAIN_MENU') return true
  const character = getCharacter(save.characterId ?? null)
  if (!character) return false
  const ids = new Set(character.encounters.map(e => e.id))
  return Array.isArray(save.encounterQueue) && save.encounterQueue.every(id => ids.has(id))
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}
