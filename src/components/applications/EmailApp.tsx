import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { CharacterPhoneData } from '../../data/characterData'
import type { Encounter } from '../../game/types'

export function EmailApp({ data, encounter }: { data?: CharacterPhoneData; encounter?: Encounter }) {
  const [selected, setSelected] = useState<number | null>(null)
  const emailData = data?.emails ?? []
  if (selected !== null) {
    if (selected === -1 && encounter) {
      return (
        <div className="app-content email-detail">
          <button className="detail-back" onClick={() => setSelected(null)}><ArrowLeft size={18} /> Inbox</button>
          <h2>{encounter.trigger.title}</h2>
          <div className="email-sender"><div className="avatar">!</div><div><strong>{encounter.trigger.sender}</strong><span>to me</span></div><time>now</time></div>
          <p>{encounter.trigger.message}</p>
        </div>
      )
    }
    const email = emailData[selected]
    return (
      <div className="app-content email-detail">
        <button className="detail-back" onClick={() => setSelected(null)}><ArrowLeft size={18} /> Inbox</button>
        <h2>{email.subject}</h2>
        <div className="email-sender"><div className="avatar">{email.sender[0]}</div><div><strong>{email.sender}</strong><span>to me</span></div><time>{email.time}</time></div>
        <p>{email.body ?? email.preview}</p>
      </div>
    )
  }
  return (
    <div className="app-content">
      <div className="app-title-row"><h2>Inbox</h2><button>Compose</button></div>
      <div className="email-list">
        {encounter?.trigger.app === 'email' && (
          <button className="email-row encounter-email" onClick={() => setSelected(-1)}>
            <i />
            <div><strong>{encounter.trigger.sender}</strong><time>now</time></div>
            <b>{encounter.trigger.title}</b>
            <span>{encounter.trigger.message}</span>
          </button>
        )}
        {emailData.map((email, index) => (
          <button className="email-row" key={email.id} onClick={() => setSelected(index)}>
            {email.unread && <i />}
            <div><strong>{email.sender}</strong><time>{email.time}</time></div>
            <b>{email.subject}</b>
            <span>{email.preview}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
