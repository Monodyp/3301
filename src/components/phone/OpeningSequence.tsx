import { useState } from 'react'
import { Bell, MessageCircle, ShieldAlert } from 'lucide-react'
import type { CharacterPhoneData } from '../../data/characterData'
import type { Encounter } from '../../game/types'

export function OpeningSequence({ data, firstEncounter, playerName, onFinish }: {
  data: CharacterPhoneData
  firstEncounter?: Encounter
  playerName?: string
  onFinish: () => void
}) {
  const [step, setStep] = useState(0)
  const firstMessage = data.conversations[0]
  const next = () => step === 3 ? onFinish() : setStep(current => current + 1)
  const labels = [
    playerName ? 'EVENT PARTICIPANT' : 'PERSONAL DEVICE',
    playerName ? '11:47 PM · YOUR DEVICE' : `11:47 PM · ${data.profile.location.toUpperCase()}`,
    'PHONE ACTIVITY',
    'INCOMING INCIDENT',
  ]
  const details = [
    <div key="profile"><div className="opening-profile-orb" style={{ background: data.profile.color }}>{playerName?.[0]?.toUpperCase() ?? data.profile.name[0]}</div><h1>{playerName ?? data.profile.name}</h1><p>{playerName ? 'Your display name for this session.' : `${data.profile.occupation} · ${data.profile.location}`}</p></div>,
    <div className="opening-phone-peek" key="message"><MessageCircle size={18} /><div><strong>{firstMessage?.name ?? 'Messages'}</strong><p>{firstMessage?.preview ?? 'One unread message'}</p></div><time>{firstMessage?.time ?? 'now'}</time></div>,
    <div className="opening-phone-peek opening-phone-peek-muted" key="notification"><Bell size={18} /><div><strong>New notification</strong><p>Something is trying to get your attention.</p></div></div>,
    <div className="opening-incident" key="incident"><ShieldAlert size={24} /><strong>{firstEncounter?.trigger.title ?? 'New security alert'}</strong><p>{firstEncounter?.trigger.message ?? 'Review the notification when it arrives.'}</p></div>,
  ]
  const notes = [
    '',
    'A familiar screen. A late-night routine.',
    'A quiet vibration fades into the room.',
    'The first incident can arrive through any app.',
  ]

  return <section className="opening-sequence" aria-label="Opening sequence">
    <div className="opening-sequence-progress" aria-hidden="true">{[0, 1, 2, 3].map(index => <i className={index <= step ? 'active' : ''} key={index} />)}</div>
    <div className={`opening-sequence-copy opening-sequence-step-${step}`}>
      <span className="opening-sequence-label">{labels[step]}</span>
      <div className="opening-sequence-detail">{details[step]}</div>
      <p className="opening-sequence-note">{notes[step]}</p>
    </div>
    <button className="opening-sequence-button" onClick={next}>{step === 3 ? 'Open phone' : 'Continue'}</button>
  </section>
}
