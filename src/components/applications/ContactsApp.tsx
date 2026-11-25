import { useState, type ReactNode } from 'react'
import { ArrowLeft, Phone, MessageCircle } from 'lucide-react'
import type { CharacterPhoneData } from '../../data/characterData'
import type { Encounter } from '../../game/types'

const contacts = [
  { name: 'Mara Vale', role: 'Digital archivist', color: '#b69bd6' },
  { name: 'Theo Park', role: 'Transit engineer', color: '#78a9a0' },
  { name: 'Lena Ortiz', role: 'Journalist', color: '#c88f92' },
  { name: 'Noah Reed', role: 'Friend', color: '#8397b5' },
]

export function ContactsApp({ data, encounter: _encounter, clues, actionPanel }: { data?: CharacterPhoneData; encounter?: Encounter; clues?: (surface: 'incident' | 'app') => ReactNode; actionPanel?: ReactNode }) {
  const [selected, setSelected] = useState<number | null>(null)
  const contactsData = data?.contacts ?? contacts
  if (selected !== null) {
    const contact = contactsData[selected]
    return (
      <div className="app-content contact-detail">
        <button className="detail-back" onClick={() => setSelected(null)}><ArrowLeft size={18} /> Contacts</button>
        <div className="large-avatar" style={{ background: contact.color }}>{contact.name[0]}</div>
        <h2>{contact.name}</h2><p>{contact.role}</p>
        <div className="contact-actions"><button><Phone size={20} /><span>call</span></button><button><MessageCircle size={20} /><span>message</span></button></div>
        {actionPanel}
      </div>
    )
  }
  return (
    <div className="app-content">
      <div className="app-title-row"><h2>Contacts</h2><button>＋</button></div>
      <div className="search-field">Search contacts</div>
      {clues?.('app')}
      <div className="contact-list">
        {contactsData.map((contact, index) => (
          <button key={contact.name} onClick={() => setSelected(index)}>
            <div className="avatar" style={{ background: contact.color }}>{contact.name[0]}</div>
            <div><strong>{contact.name}</strong><span>{contact.role}</span></div>
          </button>
        ))}
      </div>
      {actionPanel}
    </div>
  )
}
