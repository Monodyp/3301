import { useState, type FormEvent } from 'react'
import { ArrowLeft, Phone, MessageCircle, MoreHorizontal } from 'lucide-react'
import type { CharacterPhoneData } from '../../data/characterData'
import type { Encounter } from '../../game/types'
import type { Game } from '../../game/useGame'
import { usePassiveClueTarget } from '../investigation/PassiveClueTarget'
import { ScenarioPhoneInteraction } from './ScenarioPhoneInteraction'
import { interactionsFor, performPhoneInteraction } from './phoneInteractionUtils'

const contacts = [
  { name: 'Mara Vale', role: 'Digital archivist', color: '#b69bd6' },
  { name: 'Theo Park', role: 'Transit engineer', color: '#78a9a0' },
  { name: 'Lena Ortiz', role: 'Journalist', color: '#c88f92' },
  { name: 'Noah Reed', role: 'Friend', color: '#8397b5' },
]

export function ContactsApp({ game, data, encounter }: { game: Game; data?: CharacterPhoneData; encounter?: Encounter }) {
  const [selected, setSelected] = useState<number | null>(null)
  const [callActive, setCallActive] = useState(false)
  const [messageOpen, setMessageOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [messageText, setMessageText] = useState('')
  const contactsData = data?.contacts ?? contacts
  const contactArtifact = encounter?.artifacts.find(artifact => artifact.app === 'contacts')
  const expectedContact = game.resolutionAction?.action.interactions.find(interaction =>
    interaction.classification === 'correct' && interaction.expectedContact,
  )?.expectedContact
  const selectedContact = selected === null ? undefined : contactsData[selected]
  const clueRef = usePassiveClueTarget(
    game,
    'contacts',
    'app',
    Boolean(selectedContact && (!expectedContact || selectedContact.name === expectedContact)),
  )
  const callInteractions = interactionsFor(game, 'contacts', 'contact-call')
  const messageInteractions = interactionsFor(game, 'contacts', 'contact-message')
  const protectiveMenuActions = interactionsFor(game, 'contacts', 'menu-item')
  const showContactMenu = protectiveMenuActions.length > 0
    && (!expectedContact || selectedContact?.name === expectedContact)
  const submitMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = messageText.trim().toLowerCase()
    if (!text) return
    const interaction = messageInteractions.find(item => item.label
      .toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 4)
      .some(word => text.includes(word)))
    if (interaction) performPhoneInteraction(game, interaction)
    setMessageText('')
    setMessageOpen(false)
  }
  if (selected !== null) {
    const contact = contactsData[selected]
    const matchingCallInteractions = callInteractions.filter(interaction =>
      !interaction.expectedContact || interaction.expectedContact.toLowerCase() === contact.name.toLowerCase(),
    )
    return (
      <div className="app-content contact-detail" ref={clueRef}>
        <div className="contact-detail-toolbar">
          <button className="detail-back" onClick={() => { setSelected(null); setMenuOpen(false) }}><ArrowLeft size={18} /> Contacts</button>
          {showContactMenu && (
            <div className="contact-options-anchor">
              <button aria-label="Contact options" onClick={() => setMenuOpen(value => !value)}><MoreHorizontal size={20} /></button>
              {menuOpen && (
                <div className="native-phone-menu" role="menu">
                  {protectiveMenuActions.map(interaction => (
                    <ScenarioPhoneInteraction
                      key={interaction.id}
                      game={game}
                      interaction={interaction}
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="large-avatar" style={{ background: contact.color }}>{contact.name[0]}</div>
        <h2>{contact.name}</h2><p>{contact.role}</p>
        {contactArtifact && (!expectedContact || expectedContact === contact.name) && (
          <p className="contact-note" data-clue-target={contactArtifact.id}>{contactArtifact.detail}</p>
        )}
        <div className="contact-actions">
          {callActive
            ? <button disabled><Phone size={20} /><span>connected</span></button>
            : matchingCallInteractions.length > 0
              ? <ScenarioPhoneInteraction game={game} interaction={matchingCallInteractions[0]} className="native-contact-action" onClick={() => setCallActive(true)} parameters={{ contactName: contact.name }}><Phone size={20} /><span>call</span></ScenarioPhoneInteraction>
            : <button><Phone size={20} /><span>call</span></button>}
          {messageInteractions.length > 0
            ? <button onClick={() => setMessageOpen(value => !value)}><MessageCircle size={20} /><span>message</span></button>
            : <button><MessageCircle size={20} /><span>message</span></button>}
        </div>
        {callActive && matchingCallInteractions.length > 0 && (
          <div className="contact-call-panel" aria-live="polite">
            <span>Connected · saved contact</span>
            <ScenarioPhoneInteraction game={game} interaction={matchingCallInteractions[0]} parameters={{ contactName: contact.name }}>Ask if the request was expected</ScenarioPhoneInteraction>
          </div>
        )}
        {messageOpen && messageInteractions.length > 0 && (
          <form className="contact-message-composer" onSubmit={submitMessage}>
            <input aria-label="Message text" value={messageText} onChange={event => setMessageText(event.target.value)} placeholder="Message…" />
            <button type="submit" disabled={!messageText.trim()}>Send</button>
          </form>
        )}
      </div>
    )
  }
  return (
    <div className="app-content">
      <div className="app-title-row"><h2>Contacts</h2><button>＋</button></div>
      <div className="search-field">Search contacts</div>
      <div className="contact-list">
        {contactsData.map((contact, index) => (
          <button key={contact.name} onClick={() => { setCallActive(false); setMessageOpen(false); setMenuOpen(false); setSelected(index) }}>
            <div className="avatar" style={{ background: contact.color }}>{contact.name[0]}</div>
            <div><strong>{contact.name}</strong><span>{contact.role}</span></div>
          </button>
        ))}
      </div>
    </div>
  )
}
