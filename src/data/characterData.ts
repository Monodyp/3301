
export interface CharacterProfile {
  id: string
  name: string
  location: string
  occupation: string
  color: string
}

export interface ContactData {
  name: string
  role: string
  color: string
  account?: string
  artifactId?: string
  encounterId?: string
}

export interface ConversationData {
  id: number
  name: string
  preview: string
  time: string
  unread: number
  color: string
  messages: MessageData[]
  cannedReplies?: string[]
}

export interface MessageData {
  from: 'them' | 'me' | 'system'
  text: string
  time: string
  artifactId?: string
  encounterId?: string
}

export interface SocialPostData {
  id: number
  user: string
  handle: string
  text: string
  time: string
  likes: number
  comments: number
  color: string
  artifactId?: string
  encounterId?: string
}

export interface EmailData {
  id: number
  sender: string
  address?: string
  subject: string
  preview: string
  body: string
  time: string
  unread: boolean
  artifactId?: string
  encounterId?: string
}

export interface BrowserPageData {
  id: string
  title: string
  url: string
  subtitle: string
  body: string
  suspicious?: boolean
  artifactId?: string
  encounterId?: string
}

export interface AdvertisementData {
  id: string
  title: string
  description: string
  destination: string
  artifactId?: string
  encounterId?: string
}

export interface CallData {
  name: string
  detail: string
  status: 'missed' | 'normal'
  color: string
  artifactId?: string
  encounterId?: string
}

export interface WalletTransactionData {
  name: string
  detail: string
  amount: number
  artifactId?: string
  encounterId?: string
}

export interface SettingsData {
  wifi: string
  appearance: string
  battery: number
  storage: string
  securityStatus: 'Secure' | 'Review needed' | 'Compromised'
}

export interface CharacterPhoneData {
  profile: CharacterProfile
  contacts: ContactData[]
  conversations: ConversationData[]
  socialPosts: SocialPostData[]
  emails: EmailData[]
  browserPages: BrowserPageData[]
  advertisements: AdvertisementData[]
  calls: CallData[]
  walletTransactions: WalletTransactionData[]
  walletBalance: number
  settings: SettingsData
  stories: { name: string; color: string }[]
  specializedViews: Partial<Record<'livestream' | 'marketplace' | 'wifi' | 'jobs' | 'ctf', boolean>>
  specializedContent: {
    livestream?: LivestreamData
    marketplace?: MarketplaceData
    wifi?: WifiData
    jobs?: JobBoardData
    ctf?: CtfData
  }
}

export interface LivestreamData {
  title: string
  status: string
  viewers: number
  message: string
  evidenceId?: string
}
export interface MarketplaceData {
  title: string
  listings: { id: string; title: string; detail: string; suspicious?: boolean }[]
  evidenceId?: string
}
export interface WifiData {
  network: string
  portalTitle: string
  warning: string
  fields: string[]
  evidenceId?: string
}
export interface JobBoardData {
  title: string
  postings: { id: string; title: string; company: string; warning?: string }[]
  evidenceId?: string
}
export interface CtfData {
  title: string
  challenges: { id: string; title: string; points: number; solved: boolean }[]
  evidenceId?: string
}

export const CHARACTER_PHONE_DATA: Record<string, CharacterPhoneData> = {
  mika: {
    profile: { id: 'mika', name: 'Mika', location: 'Northbridge', occupation: 'University student and streamer', color: '#c5a8ff' },
    contacts: [
      { name: 'Mara Vale', role: 'Digital archivist', color: '#b69bd6' },
      { name: 'Theo Park', role: 'Transit engineer', color: '#78a9a0' },
      { name: 'Lena Ortiz', role: 'Journalist', color: '#c88f92' },
      { name: 'Rafa', role: 'Creator friend', color: '#8397b5' },
    ],
    conversations: [
      { id: 3, name: 'StarWatcher', preview: 'Can we move somewhere private?', time: 'Day 6', unread: 1, color: '#9a718d', messages: [], cannedReplies: ['I will keep this public.', 'I need to verify your claims.'] },
      { id: 1, name: 'Mara', preview: 'Did you get the package?', time: '11:42', unread: 2, color: '#c5a8ff', messages: [
        { from: 'them', text: 'Hey. Are you still awake?', time: '11:39' },
        { from: 'me', text: 'Just got back. What happened?', time: '11:40' },
        { from: 'them', text: 'Did you get the package?', time: '11:42' },
      ], cannedReplies: ['I will be careful.', 'Can you explain where it came from?'] },
      { id: 2, name: 'Theo Park', preview: 'The server key changed again.', time: '10:18', unread: 0, color: '#80c7a4', messages: [
        { from: 'them', text: 'The server key changed again. Do not reuse the old one.', time: '10:18' },
      ], cannedReplies: ['Thanks. I will keep this private.'] },
    ],
    socialPosts: [
      { id: 1, user: 'theo.p', handle: '@theopark', text: 'Late train. Strange message in the maintenance logs. Nothing I can post yet.', time: '18m', likes: 24, comments: 5, color: '#7aa6c9' },
      { id: 2, user: 'Mara Vale', handle: '@maravale', text: 'Found the old observatory schedule. Some of these dates are circled three times.', time: '1h', likes: 81, comments: 12, color: '#a993ce' },
    ],
    emails: [
      { id: 1, sender: 'Northbridge Transit', address: 'alerts@northbridge.example', subject: 'Route closure notice', preview: 'A section of Line 4 will remain closed overnight...', body: 'A section of Line 4 will remain closed overnight. Use the posted service alternatives.', time: '10:06', unread: true },
      { id: 2, sender: 'M. Rowan', address: 'm.rowan@northbridge.example', subject: 'Package collection', preview: 'It is under the name Avery. Do not open it near cameras.', body: 'It is under the name Avery. Do not open it near cameras. Use the service door.', time: '09:31', unread: true },
    ],
    browserPages: [
      { id: 'nb-directory', title: 'Northbridge', url: 'northbridge.local', subtitle: 'Local network directory', body: 'Transit schedules, municipal records, and building maintenance notices.' },
      { id: 'creator-help', title: 'Creator Support', url: 'creator-support.example', subtitle: 'Fictional creator portal', body: 'Account help and creator verification information.', suspicious: true },
    ],
    advertisements: [
      { id: 'stream-ad', title: 'Creator Growth Lab', description: 'Sponsored stream growth tools.', destination: 'growth.example/start' },
    ],
    calls: [
      { name: 'Mara Vale', detail: 'Mobile · 11:48', status: 'missed', color: '#b69bd6' },
      { name: 'Theo Park', detail: 'Incoming · Yesterday', status: 'normal', color: '#78a9a0' },
    ],
    walletTransactions: [
      { name: 'Northbridge Transit', detail: 'Today · 10:21', amount: -4.25 },
      { name: 'Juniper Cafe', detail: 'Yesterday · 08:40', amount: -7.8 },
    ],
    walletBalance: 3200,
    settings: { wifi: 'Northbridge', appearance: 'Dark', battery: 72, storage: '38.2 GB', securityStatus: 'Secure' },
    stories: [
      { name: 'Mara', color: '#b69bd6' },
      { name: 'Theo', color: '#78a9a0' },
      { name: 'Lena', color: '#c88f92' },
      { name: 'Rafa', color: '#8397b5' },
    ],
    specializedViews: { livestream: true },
    specializedContent: {
      livestream: { title: 'Mika Stream Control', status: 'Offline', viewers: 0, message: 'Preview the stream before going live. No account credentials are needed.' },
    },
  },
  rafa: {
    profile: { id: 'rafa', name: 'Rafa', location: 'San Estrella', occupation: 'IT support trainee', color: '#80c7a4' },
    contacts: [
      { name: 'Mika', role: 'Streamer', color: '#c5a8ff' },
      { name: 'Nico Santos', role: 'Classmate', color: '#78a9a0' },
      { name: 'Ben Cruz', role: 'Trusted mentor', color: '#8397b5' },
    ],
    conversations: [
      { id: 3, name: 'Lance', preview: 'Share the lab reset tool.', time: 'Day 4', unread: 1, color: '#9a718d', messages: [], cannedReplies: ['I need to verify your role.', 'I cannot share lab access.'] },
      { id: 1, name: 'Ben Cruz', preview: 'Verify it from the actual portal.', time: '11:36', unread: 1, color: '#8397b5', messages: [
        { from: 'them', text: 'Before clicking, verify the sender and destination.', time: '11:36' },
      ], cannedReplies: ['I checked the official portal.', 'I am going to wait and verify.'] },
      { id: 2, name: 'Nico Santos', preview: 'The lab is open tonight.', time: '09:12', unread: 0, color: '#78a9a0', messages: [
        { from: 'them', text: 'The lab is open tonight. Bring only the practice account.', time: '09:12' },
      ], cannedReplies: ['I will use the practice environment.'] },
    ],
    socialPosts: [
      { id: 1, user: 'San Estrella Tech', handle: '@setech', text: 'Community lab session moved indoors. Never share real credentials at training events.', time: '25m', likes: 18, comments: 4, color: '#78a9a0' },
      { id: 2, user: 'Nico Santos', handle: '@nicosantos', text: 'Practicing network defense in a closed lab this evening.', time: '2h', likes: 42, comments: 7, color: '#8397b5' },
    ],
    emails: [
      { id: 1, sender: 'Lab Administration', address: 'lab@sanestrella.example', subject: 'Tonight’s practice portal', preview: 'Use only the practice credentials in the lab brief...', body: 'Use only the practice credentials in the lab brief. Never enter personal passwords.', time: '10:02', unread: true },
      { id: 2, sender: 'Ben Cruz', address: 'ben.cruz@trusted.example', subject: 'Before you open that link', preview: 'Type the address yourself and confirm the certificate.', body: 'Type the address yourself and confirm the certificate. Do not respond with credentials.', time: 'Yesterday', unread: false },
    ],
    browserPages: [
      { id: 'lab-board', title: 'San Estrella Lab', url: 'lab.sanestrella.local', subtitle: 'Practice CTF platform', body: 'Closed training challenges for fictional practice accounts.' },
      { id: 'portal-preview', title: 'Credential Portal Preview', url: 'signin-preview.example', subtitle: 'Suspicious destination preview', body: 'This local preview does not collect or transmit credentials.', suspicious: true },
    ],
    advertisements: [
      { id: 'lab-ad', title: 'Security Skills Workshop', description: 'A fictional beginner workshop.', destination: 'workshop.example/register' },
    ],
    calls: [
      { name: 'Ben Cruz', detail: 'Incoming · 11:31', status: 'normal', color: '#8397b5' },
      { name: 'Nico Santos', detail: 'Missed · Yesterday', status: 'missed', color: '#78a9a0' },
    ],
    walletTransactions: [
      { name: 'Campus Cafeteria', detail: 'Today · 12:08', amount: -85 },
      { name: 'Practice Lab', detail: 'Yesterday · 16:40', amount: -0 },
    ],
    walletBalance: 1850,
    settings: { wifi: 'San Estrella Lab', appearance: 'Dark', battery: 64, storage: '51.7 GB', securityStatus: 'Review needed' },
    stories: [
      { name: 'Ben', color: '#8397b5' },
      { name: 'Nico', color: '#78a9a0' },
      { name: 'Mika', color: '#c5a8ff' },
      { name: 'Lab', color: '#6f9a83' },
    ],
    specializedViews: { ctf: true, jobs: true },
    specializedContent: {
      ctf: { title: 'San Estrella Practice CTF', challenges: [
        { id: 'ctf-1', title: 'Spot the spoofed login', points: 100, solved: false },
        { id: 'ctf-2', title: 'Trace the suspicious sender', points: 150, solved: false },
      ] },
      jobs: { title: 'Campus Job Board', postings: [
        { id: 'job-1', title: 'Lab assistant', company: 'San Estrella Lab', warning: 'Use the official campus contact.' },
      ] },
    },
  },
}

export function getCharacterPhoneData(characterId: string | null | undefined): CharacterPhoneData {
  if (characterId && CHARACTER_PHONE_DATA[characterId]) return CHARACTER_PHONE_DATA[characterId]
  return CHARACTER_PHONE_DATA.mika
}
