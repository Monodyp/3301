export type AppId =
  | 'messages'
  | 'social'
  | 'email'
  | 'browser'
  | 'contacts'
  | 'calls'
  | 'wallet'
  | 'settings'
  | 'livestream'
  | 'marketplace'
  | 'wifi'
  | 'jobs'
  | 'ctf'

export type HorrorStage = 'NORMAL' | 'UNSETTLED' | 'COMPROMISED' | 'BLACKOUT'

export interface GameNotification {
  id: string
  title: string
  message: string
  source: AppId
  timestamp: string
  unreadIncrement?: boolean
}
