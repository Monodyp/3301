import { useState, type ReactNode } from 'react'
import { ArrowLeft, Heart, MessageCircle, Share2 } from 'lucide-react'
import type { CharacterPhoneData } from '../../data/characterData'
import type { Encounter, PhoneEvent } from '../../game/types'
import { PHONE_TARGETS } from '../../game/narrative'
import { ReadMarker } from './ReadMarker'

export function SocialApp({ data, encounter, onPhoneEvent, clues, actionPanel }: { data?: CharacterPhoneData; encounter?: Encounter; onPhoneEvent?: (event: PhoneEvent) => void; clues?: (surface: 'incident' | 'app') => ReactNode; actionPanel?: ReactNode }) {
  const [incidentOpen, setIncidentOpen] = useState(false)
  const posts = data?.socialPosts ?? []
  const incident = encounter?.trigger.app === 'social' ? encounter : undefined

  if (incident && incidentOpen) {
    const target = PHONE_TARGETS.incident(incident.id)
    return (
      <div className="app-content">
        <button className="detail-back" onClick={() => setIncidentOpen(false)}><ArrowLeft size={18} /> Feed</button>
        <div className="social-post encounter-post">
          <div className="post-avatar" style={{ background: '#8c5c68' }}>!</div>
          <div className="post-body">
            <div className="post-head"><strong>{incident.trigger.sender}</strong><span>{incident.trigger.title}</span></div>
            <p>{incident.trigger.message}</p>
          </div>
        </div>
        <div className="social-thread" aria-label={`${incident.trigger.sender} discussion`}>
          {incident.thread.map((message, index) => (
            <article key={index} className={`social-thread-item ${message.from}`}>
              <strong>{message.from === 'me' ? data?.profile.name ?? 'Me' : message.sender ?? 'Notice'}</strong>
              <p>{message.text}</p>
              {message.time && <time>{message.time}</time>}
            </article>
          ))}
          <ReadMarker key={target} onRead={() => onPhoneEvent?.({ kind: 'MESSAGE_READ', app: 'social', target })} />
          {clues?.('incident')}
        </div>
        {actionPanel}
      </div>
    )
  }

  return (
    <div className="app-content">
      <div className="app-title-row"><h2>Social</h2><button>•••</button></div>
      <div className="stories">
        {(data?.stories ?? []).map(story => (
          <div key={story.name}><span style={{ background: story.color }}>{story.name[0]}</span><small>{story.name}</small></div>
        ))}
      </div>
      {clues?.('app')}
      <div className="social-feed">
        {incident && (
          <button className="social-post encounter-post" onClick={() => {
            setIncidentOpen(true)
            onPhoneEvent?.({ kind: 'CONVERSATION_OPENED', app: 'social', target: PHONE_TARGETS.incident(incident.id) })
          }}>
            <div className="post-avatar" style={{ background: '#8c5c68' }}>!</div>
            <div className="post-body">
              <div className="post-head"><strong>{incident.trigger.sender}</strong><span>Encounter · now</span></div>
              <p>{incident.trigger.message}</p>
            </div>
          </button>
        )}
        {posts.map(post => (
          <article className="social-post" key={post.id}>
            <div className="post-avatar" style={{ background: post.color }}>{post.user[0]}</div>
            <div className="post-body">
              <div className="post-head"><strong>{post.user}</strong><span>{post.handle} · {post.time}</span></div>
              <p>{post.text}</p>
              <div className="post-actions"><span><Heart size={16} /> {post.likes}</span><span><MessageCircle size={16} /> {post.comments}</span><Share2 size={16} /></div>
            </div>
          </article>
        ))}
      </div>
      {actionPanel}
    </div>
  )
}
