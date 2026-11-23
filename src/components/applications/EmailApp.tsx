import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { emails } from '../../data/mockData'

export function EmailApp() {
  const [selected, setSelected] = useState<number | null>(null)
  if (selected !== null) {
    const email = emails[selected]
    return (
      <div className="app-content email-detail">
        <button className="detail-back" onClick={() => setSelected(null)}><ArrowLeft size={18} /> Inbox</button>
        <h2>{email.subject}</h2>
        <div className="email-sender"><div className="avatar">{email.sender[0]}</div><div><strong>{email.sender}</strong><span>to me</span></div><time>{email.time}</time></div>
        <p>{selected === 1 ? 'It is under the name Avery. Do not open it near cameras. Use the service door and delete this message when you arrive.' : email.preview}</p>
      </div>
    )
  }
  return (
    <div className="app-content">
      <div className="app-title-row"><h2>Inbox</h2><button>Compose</button></div>
      <div className="email-list">
        {emails.map((email, index) => (
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
