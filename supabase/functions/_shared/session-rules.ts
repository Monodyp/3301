export type SessionStatus = 'waiting' | 'active' | 'completed'

export function isSessionStatus(value: unknown): value is SessionStatus {
  return value === 'waiting' || value === 'active' || value === 'completed'
}

export function canTransitionSession(current: SessionStatus, next: SessionStatus): boolean {
  if (current === next) return true
  if (current === 'waiting') return next === 'active'
  return current === 'active' && next === 'completed'
}
