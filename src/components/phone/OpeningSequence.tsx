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
  const copy = [
    playerName
      ? <><span className="opening-sequence-label">EVENT PARTICIPANT</span><div className="opening-profile-orb" style={{ background: data.profile.color }}>{playerName[0]?.toUpperCase() ?? 'P'}</div><h1>{playerName}</h1><p>Your display name for this session.</p></>
      : <><span className="opening-sequence-label">PERSONAL DEVICE</span><div className="opening-profile-orb" style={{ background: data.profile.color }}>{data.profile.name[0]}</div><h1>{data.profile.name}</h1><p>{data.profile.occupation} · {data.profile.location}</p></>,
    <><span className="opening-sequence-label">{playerName ? `STORY CONTEXT · ${data.profile.name.toUpperCase()}` : `11:47 PM · ${data.profile.location.toUpperCase()}`}</span><div className="opening-phone-peek"><MessageCircle size={18} /><div><strong>{firstMessage?.name ?? 'Messages'}</strong><p>{firstMessage?.preview ?? 'One unread message'}</p></div><time>{firstMessage?.time ?? 'now'}</time></div><p className="opening-sequence-note">A familiar screen. A late-night routine.</p></>,
    <><span className="opening-sequence-label">PHONE ACTIVITY</span><div className="opening-phone-peek opening-phone-peek-muted"><Bell size={18} /><div><strong>New notification</strong><p>Something is trying to get your attention.</p></div></div><p className="opening-sequence-note">Stay alert. Verify before you act.</p></>,
    <><span className="opening-sequence-label">INCOMING INCIDENT</span><div className="opening-incident"><ShieldAlert size={24} /><strong>{firstEncounter?.trigger.title ?? 'New security alert'}</strong><p>{firstEncounter?.trigger.message ?? 'Review the notification when it arrives.'}</p></div><p className="opening-sequence-note">The first incident can arrive through any app.</p></>,
  ]

  return <section className="opening-sequence" aria-label="Opening sequence">
    <div className="opening-sequence-progress" aria-hidden="true">{[0, 1, 2, 3].map(index => <i className={index <= step ? 'active' : ''} key={index} />)}</div>
    <div className="opening-sequence-copy">{copy[step]}</div>
    <button className="opening-sequence-button" onClick={next}>{step === 3 ? 'Open phone' : 'Continue'}</button>
  </section>
}
