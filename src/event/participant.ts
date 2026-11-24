export interface StoredParticipant {
  sessionId: string
  registrationId: string
  playerId: string | null
  nickname: string
  sessionName: string
  completionStatus: 'joined' | 'in_progress' | 'completed'
  eventRunStarted: boolean
}

export const EVENT_PARTICIPANT_KEY = '3301.event-participant'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function normalizeSessionId(value: string): string | null {
  const normalized = value.trim().toLowerCase()
  return UUID_PATTERN.test(normalized) ? normalized : null
}

export function normalizeNickname(value: string): string | null {
  const normalized = value.trim()
  const characters = Array.from(normalized)
  if (characters.length < 1 || characters.length > 32 || characters.some(isControlCharacter)) return null
  return normalized
}

export function createRegistrationId(): string {
  const cryptoApi = globalThis.crypto
  if (!cryptoApi?.getRandomValues) throw new Error('Secure browser randomness is required to join an event.')
  if (typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID()

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function registrationIdForSession(
  existing: Pick<StoredParticipant, 'sessionId' | 'registrationId'> | null,
  sessionId: string,
): string {
  return existing?.sessionId === sessionId ? existing.registrationId : createRegistrationId()
}

export function loadStoredParticipant(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): StoredParticipant | null {
  try {
    const raw = storage?.getItem(EVENT_PARTICIPANT_KEY)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (!isStoredParticipant(value)) return null
    return value
  } catch {
    return null
  }
}

export function saveStoredParticipant(
  participant: StoredParticipant,
  storage: Pick<Storage, 'setItem'> | undefined = safeStorage(),
): void {
  if (!storage) throw new Error('Browser storage is unavailable; this event registration cannot be saved.')
  storage.setItem(EVENT_PARTICIPANT_KEY, JSON.stringify(participant))
}

export function clearStoredParticipant(
  storage: Pick<Storage, 'removeItem'> | undefined = safeStorage(),
): void {
  storage?.removeItem(EVENT_PARTICIPANT_KEY)
}

function isStoredParticipant(value: unknown): value is StoredParticipant {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const participant = value as Partial<StoredParticipant>
  return typeof participant.sessionId === 'string'
    && normalizeSessionId(participant.sessionId) !== null
    && typeof participant.registrationId === 'string'
    && UUID_PATTERN.test(participant.registrationId)
    && (participant.playerId === null
      || (typeof participant.playerId === 'string' && UUID_PATTERN.test(participant.playerId)))
    && typeof participant.nickname === 'string'
    && normalizeNickname(participant.nickname) !== null
    && typeof participant.sessionName === 'string'
    && ['joined', 'in_progress', 'completed'].includes(String(participant.completionStatus))
    && typeof participant.eventRunStarted === 'boolean'
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

function isControlCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0
  return codePoint <= 0x1f || codePoint === 0x7f
}
