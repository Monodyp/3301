export interface StoredVoicemail {
  id: string
  caller: string
  message: string
}

const keyFor = (sessionId: string) => `3301.voicemails.${sessionId}`

export function loadVoicemails(sessionId: string | null, storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): StoredVoicemail[] {
  if (!sessionId) return []
  try {
    const value = JSON.parse(storage?.getItem(keyFor(sessionId)) ?? '[]')
    return Array.isArray(value) && value.every(isVoicemail) ? value : []
  } catch {
    return []
  }
}

export function saveVoicemails(sessionId: string | null, voicemails: readonly StoredVoicemail[], storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  if (!sessionId) return
  try {
    storage?.setItem(keyFor(sessionId), JSON.stringify(voicemails))
  } catch {
    // Presentation state is optional when browser storage is blocked or full.
  }
}

export function addVoicemail(existing: readonly StoredVoicemail[], voicemail: StoredVoicemail): StoredVoicemail[] {
  return existing.some(item => item.id === voicemail.id) ? [...existing] : [...existing, voicemail]
}

function isVoicemail(value: unknown): value is StoredVoicemail {
  return typeof value === 'object' && value !== null
    && typeof (value as StoredVoicemail).id === 'string'
    && typeof (value as StoredVoicemail).caller === 'string'
    && typeof (value as StoredVoicemail).message === 'string'
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}
