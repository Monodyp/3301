import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { CharacterPhoneData } from '../../data/characterData'
import type { ConversationData } from '../../data/characterData'
import type { Encounter } from '../../game/types'

export function MessagesApp({ data, encounter }: { data?: CharacterPhoneData; encounter?: Encounter }) {
  const [selected, setSelected] = useState<number | null>(null)
  const [sentReplies, setSentReplies] = useState<Record<number, string[]>>({})
  const conversationsData: ConversationData[] = data?.conversations ?? []
  if (selected !== null) {
    const conversation = conversationsData.find(item => item.id === selected) ?? conversationsData[0]
    if (!conversation) return null
    const extraReplies = sentReplies[conversation.id] ?? []
    return (
      <div className="app-content chat-view">
        <div className="chat-header">
          <button onClick={() => setSelected(null)} aria-label="Back to conversations"><ArrowLeft size={20} /></button>
          <div className="avatar" style={{ background: conversation.color }}>{conversation.name[0]}</div>
          <strong>{conversation.name}</strong>
        </div>
        <div className="chat-thread">
          {[...(encounter?.trigger.app === 'messages' && conversation.name === encounter.trigger.sender
            ? encounter.thread.filter(message => message.sender === encounter.trigger.sender || message.sender === undefined)
            : []), ...conversation.messages].map((message, index) => (
            <div key={index} className={`chat-bubble ${message.from}`}>
              <span>{message.text}</span><time>{message.time}</time>
            </div>
          ))}
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
      <div className="conversation-list">
        {conversationsData.map(item => (
          <button key={item.id} className="conversation" onClick={() => setSelected(item.id)}>
            <div className="avatar" style={{ background: item.color }}>{item.name[0]}</div>
            <div className="conversation-copy"><strong>{item.name}</strong><span>{item.preview}</span></div>
            <div className="conversation-meta"><time>{item.time}</time>{item.unread > 0 && <b>{item.unread}</b>}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
