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
  decisionId?: string // tapping opens this pending decision instead of the app
  variant?: 'attack' // a cyberattack notification, styled by tier
  tier?: 1 | 2 | 3 | 4 // 1 anomaly, 2 intrusion, 3 compromise, 4 later escalation
  tierLabel?: string
  detail?: string
}
