import { useState, type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { CharacterPhoneData } from '../../data/characterData'
import type { Encounter, PhoneEvent } from '../../game/types'
import { PHONE_TARGETS } from '../../game/narrative'
import { ReadMarker } from './ReadMarker'

const INCIDENT = -1

export function EmailApp({ data, encounter, onPhoneEvent, clues }: { data?: CharacterPhoneData; encounter?: Encounter; onPhoneEvent?: (event: PhoneEvent) => void; clues?: (surface: 'incident' | 'app') => ReactNode }) {
  const [selected, setSelected] = useState<number | null>(null)
  const emailData = data?.emails ?? []
  const incident = encounter?.trigger.app === 'email' ? encounter : undefined
  const targetFor = (index: number) => index === INCIDENT && incident ? PHONE_TARGETS.incident(incident.id) : PHONE_TARGETS.ambient('email', emailData[index]?.id ?? index)
  const open = (index: number) => {
    setSelected(index)
    onPhoneEvent?.({ kind: 'CONVERSATION_OPENED', app: 'email', target: targetFor(index) })
  }
  const markRead = (index: number) => () => onPhoneEvent?.({ kind: 'MESSAGE_READ', app: 'email', target: targetFor(index) })

  if (selected !== null) {
    if (selected === INCIDENT && incident) {
      return (
        <div className="app-content email-detail">
          <button className="detail-back" onClick={() => setSelected(null)}><ArrowLeft size={18} /> Inbox</button>
          <h2>{incident.trigger.title}</h2>
          <div className="email-sender"><div className="avatar">!</div><div><strong>{incident.trigger.sender}</strong><span>to me</span></div><time>now</time></div>
          <p>{incident.trigger.message}</p>
          {incident.thread.length > 0 && (
            <div className="email-thread" aria-label="Messages in this thread">
              {incident.thread.map((message, index) => (
                <div key={index} className={`email-thread-item ${message.from}`}>
                  <strong>{message.from === 'me' ? data?.profile.name ?? 'Me' : message.sender ?? 'Notice'}</strong>
                  <p>{message.text}</p>
                  {message.time && <time>{message.time}</time>}
                </div>
              ))}
            </div>
          )}
          <ReadMarker key={targetFor(INCIDENT)} onRead={markRead(INCIDENT)} />
          {clues?.('incident')}
        </div>
      )
    }
    const email = emailData[selected]
    if (!email) return null
    return (
      <div className="app-content email-detail">
        <button className="detail-back" onClick={() => setSelected(null)}><ArrowLeft size={18} /> Inbox</button>
        <h2>{email.subject}</h2>
        <div className="email-sender"><div className="avatar">{email.sender[0]}</div><div><strong>{email.sender}</strong><span>to me</span></div><time>{email.time}</time></div>
        <p>{email.body ?? email.preview}</p>
        <ReadMarker key={targetFor(selected)} onRead={markRead(selected)} />
      </div>
    )
  }
  return (
    <div className="app-content">
      <div className="app-title-row"><h2>Inbox</h2><button>Compose</button></div>
      {clues?.('app')}
      <div className="email-list">
        {incident && (
          <button className="email-row encounter-email" onClick={() => open(INCIDENT)}>
            <i />
            <div><strong>{incident.trigger.sender}</strong><time>now</time></div>
            <b>{incident.trigger.title}</b>
            <span>{incident.trigger.message}</span>
          </button>
        )}
        {emailData.map((email, index) => (
          <button className="email-row" key={email.id} onClick={() => open(index)}>
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
