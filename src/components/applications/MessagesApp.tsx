import { useState, type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { CharacterPhoneData } from '../../data/characterData'
import type { ConversationData } from '../../data/characterData'
import type { Encounter, PhoneEvent } from '../../game/types'
import { PHONE_TARGETS } from '../../game/narrative'
import { ReadMarker } from './ReadMarker'

const INCIDENT = -1

// Reports CONVERSATION_OPENED when a conversation is opened and MESSAGE_READ
// when its last message scrolls into view. The engine decides whether either
// matters; ordinary conversations (like Mara's package chat) never do.
export function MessagesApp({ data, encounter, onPhoneEvent, clues }: { data?: CharacterPhoneData; encounter?: Encounter; onPhoneEvent?: (event: PhoneEvent) => void; clues?: (surface: 'incident' | 'app') => ReactNode }) {
  const [selected, setSelected] = useState<number | null>(null)
  const [sentReplies, setSentReplies] = useState<Record<number, string[]>>({})
  const conversationsData: ConversationData[] = data?.conversations ?? []
  const incident = encounter?.trigger.app === 'messages' ? encounter : undefined
  // Some incidents continue an existing conversation (StarWatcher, Lance).
  const incidentConversation = incident ? conversationsData.find(item => item.name === incident.trigger.sender) : undefined
  const isIncident = (id: number) => incident !== undefined && (id === INCIDENT || id === incidentConversation?.id)
  const targetFor = (id: number) => isIncident(id) && incident ? PHONE_TARGETS.incident(incident.id) : PHONE_TARGETS.ambient('messages', id)
  const open = (id: number) => {
    setSelected(id)
    onPhoneEvent?.({ kind: 'CONVERSATION_OPENED', app: 'messages', target: targetFor(id) })
  }
  const markRead = (id: number) => () => onPhoneEvent?.({ kind: 'MESSAGE_READ', app: 'messages', target: targetFor(id) })

  if (selected !== null) {
    if (selected === INCIDENT && incident) return (
      <div className="app-content chat-view">
        <div className="chat-header"><button onClick={() => setSelected(null)} aria-label="Back to conversations"><ArrowLeft size={20} /></button><strong>{incident.trigger.sender}</strong></div>
        <div className="chat-thread">
          {incident.thread.map((message, index) => <div key={index} className={`chat-bubble ${message.from}`}><span>{message.text}</span><time>{message.time}</time></div>)}
          <ReadMarker key={targetFor(INCIDENT)} onRead={markRead(INCIDENT)} />
          {clues?.('incident')}
        </div>
      </div>
    )
    const conversation = conversationsData.find(item => item.id === selected) ?? conversationsData[0]
    if (!conversation) return null
    const extraReplies = sentReplies[conversation.id] ?? []
    const thread = isIncident(conversation.id) && incident ? incident.thread : []
    return (
      <div className="app-content chat-view">
        <div className="chat-header">
          <button onClick={() => setSelected(null)} aria-label="Back to conversations"><ArrowLeft size={20} /></button>
          <div className="avatar" style={{ background: conversation.color }}>{conversation.name[0]}</div>
          <strong>{conversation.name}</strong>
        </div>
        <div className="chat-thread">
          {[...thread, ...conversation.messages].map((message, index) => (
            <div key={index} className={`chat-bubble ${message.from}`}>
              <span>{message.text}</span><time>{message.time}</time>
            </div>
          ))}
          <ReadMarker key={targetFor(conversation.id)} onRead={markRead(conversation.id)} />
          {isIncident(conversation.id) && clues?.('incident')}
          {extraReplies.map((reply, index) => (
            <div key={`reply-${index}`} className="chat-bubble me"><span>{reply}</span><time>now</time></div>
          ))}
        </div>
        <div className="canned-replies" aria-label="Canned replies">
          {(conversation.cannedReplies ?? ['I am going to verify this first.', 'I will not share private information.']).map(reply => (
            <button key={reply} onClick={() => setSentReplies(current => ({
              ...current,
              [conversation.id]: [...(current[conversation.id] ?? []), reply],
            }))}>{reply}</button>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="app-content">
      <div className="app-title-row"><h2>Messages</h2><button>Edit</button></div>
      <div className="search-field">Search</div>
      {clues?.('app')}
      <div className="conversation-list">
        {incident && !incidentConversation && <button className="conversation encounter-message" onClick={() => open(INCIDENT)}><div className="avatar">!</div><div className="conversation-copy"><strong>{incident.trigger.sender}</strong><span>{incident.trigger.message}</span></div><div className="conversation-meta"><time>now</time><b>1</b></div></button>}
        {conversationsData.map(item => (
          <button key={item.id} className={`conversation ${isIncident(item.id) ? 'encounter-message' : ''}`} onClick={() => open(item.id)}>
            <div className="avatar" style={{ background: item.color }}>{item.name[0]}</div>
            <div className="conversation-copy"><strong>{item.name}</strong><span>{isIncident(item.id) && incident ? incident.trigger.message : item.preview}</span></div>
            <div className="conversation-meta"><time>{isIncident(item.id) ? 'now' : item.time}</time>{(isIncident(item.id) || item.unread > 0) && <b>{isIncident(item.id) ? 1 : item.unread}</b>}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
