import { useState } from 'react'
import { ArrowLeft, Send } from 'lucide-react'
import { conversations, chatMessages } from '../../data/mockData'

export function MessagesApp() {
  const [selected, setSelected] = useState<number | null>(null)
  if (selected !== null) {
    return (
      <div className="app-content chat-view">
        <div className="chat-header">
          <button onClick={() => setSelected(null)} aria-label="Back to conversations"><ArrowLeft size={20} /></button>
          <div className="avatar" style={{ background: '#c5a8ff' }}>M</div>
          <strong>Mara</strong>
        </div>
        <div className="chat-thread">
          {chatMessages.map((message, index) => (
            <div key={index} className={`chat-bubble ${message.from}`}>
              <span>{message.text}</span><time>{message.time}</time>
            </div>
          ))}
        </div>
        <form className="message-input" onSubmit={(event) => event.preventDefault()}>
          <input aria-label="Message" placeholder="Text message" />
          <button aria-label="Send"><Send size={18} /></button>
        </form>
      </div>
    )
  }
  return (
    <div className="app-content">
      <div className="app-title-row"><h2>Messages</h2><button>Edit</button></div>
      <div className="search-field">Search</div>
      <div className="conversation-list">
        {conversations.map(item => (
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
