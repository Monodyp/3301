import { useState } from 'react'
import { ArrowLeft, Heart, MessageCircle, MoreHorizontal, Share2 } from 'lucide-react'
import type { CharacterPhoneData } from '../../data/characterData'
import type { Encounter, PhoneEvent } from '../../game/types'
import type { Game } from '../../game/useGame'
import { PHONE_TARGETS } from '../../game/narrative'
import { usePassiveClueTarget } from '../investigation/PassiveClueTarget'
import { ReadMarker } from './ReadMarker'
import { ScenarioPhoneInteraction } from './ScenarioPhoneInteraction'
import { interactionsFor } from './phoneInteractionUtils'

export function SocialApp({ game, data, encounter, onPhoneEvent }: { game: Game; data?: CharacterPhoneData; encounter?: Encounter; onPhoneEvent?: (event: PhoneEvent) => void }) {
  const [incidentOpen, setIncidentOpen] = useState(false)
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null)
  const [selectedReferenceId, setSelectedReferenceId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [sentComments, setSentComments] = useState<Record<string, string[]>>({})
  const posts = data?.socialPosts ?? []
  const incident = encounter?.trigger.app === 'social' ? encounter : undefined
  const incidentClueIds = game.clues
    .filter(clue => clue.source.app === 'social' && clue.source.surface === 'incident')
    .map(clue => clue.artifact.id)
  const supportingSocialArtifacts = encounter?.trigger.app === 'social'
    ? []
    : encounter?.artifacts.filter(artifact => artifact.app === 'social') ?? []
  const selectedReference = supportingSocialArtifacts.find(artifact => artifact.id === selectedReferenceId)
  const selectedPost = posts.find(post => post.id === selectedPostId)
  const incidentClueRef = usePassiveClueTarget(game, 'social', 'incident', incidentOpen && Boolean(incident))
  const appClueRef = usePassiveClueTarget<HTMLElement>(game, 'social', 'app', Boolean(selectedPost || selectedReference))
  const menuItems = interactionsFor(game, 'social', 'menu-item')
  const replies = interactionsFor(game, 'social', 'reply')
  const bookmarks = interactionsFor(game, 'social', 'bookmark')
  const menu = menuItems.length > 0 && (
    <div className="native-phone-menu" role="menu">
      {menuItems.map(interaction => <ScenarioPhoneInteraction key={interaction.id} game={game} interaction={interaction} role="menuitem">{interaction.label}</ScenarioPhoneInteraction>)}
    </div>
  )
  const renderReplyComposer = (target: string) => replies.length > 0 && (
    <div className="native-reply-options social-reply-options" aria-label="Comment replies">
      {replies.map(interaction => (
        <div className="native-reply-option" key={interaction.id}>
          <span>{interaction.label.replace(/^Send:\s*/, '')}</span>
          <ScenarioPhoneInteraction game={game} interaction={interaction} onClick={() => setSentComments(current => ({
            ...current,
            [target]: [...(current[target] ?? []), interaction.label.replace(/^Send:\s*/, '')],
          }))}>Post</ScenarioPhoneInteraction>
        </div>
      ))}
    </div>
  )
  const savePost = bookmarks.map(interaction => <ScenarioPhoneInteraction key={interaction.id} game={game} interaction={interaction} className="native-save-control">Save</ScenarioPhoneInteraction>)

  if (selectedPost) {
    return (
      <div className="app-content">
        <div className="social-toolbar"><button className="detail-back" onClick={() => setSelectedPostId(null)}><ArrowLeft size={18} /> Feed</button></div>
        <article className="social-post" ref={appClueRef}>
          <div className="post-avatar" style={{ background: selectedPost.color }}>{selectedPost.user[0]}</div>
          <div className="post-body">
            <div className="post-head"><strong>{selectedPost.user}</strong><span>{selectedPost.handle} · {selectedPost.time}</span></div>
            <p>{selectedPost.text}</p>
            <div className="post-actions"><span><Heart size={16} /> {selectedPost.likes}</span><span><MessageCircle size={16} /> {selectedPost.comments}</span><Share2 size={16} /></div>
          </div>
        </article>
        {(sentComments[String(selectedPost.id)] ?? []).map((comment, index) => <p key={`comment-${index}`} className="social-sent-comment">{comment}</p>)}
        {renderReplyComposer(String(selectedPost.id))}
      </div>
    )
  }

  if (selectedReference) {
    return (
      <div className="app-content">
        <div className="social-toolbar"><button className="detail-back" onClick={() => setSelectedReferenceId(null)}><ArrowLeft size={18} /> Feed</button></div>
        <article className="social-post" ref={appClueRef}>
          <div className="post-avatar" style={{ background: '#8c5c68' }}>{encounter?.trigger.sender[0] ?? '!'}</div>
          <div className="post-body" data-clue-target={selectedReference.id}>
            <div className="post-head"><strong>{encounter?.trigger.sender ?? 'Local account'}</strong><span>Profile activity · now</span></div>
            <p>{selectedReference.detail}</p>
            <div className="post-actions"><span><MoreHorizontal size={16} /> Account information</span></div>
          </div>
        </article>
      </div>
    )
  }

  if (incident && incidentOpen) {
    const target = PHONE_TARGETS.incident(incident.id)
    return (
      <div className="app-content">
        <div className="social-toolbar"><button className="detail-back" onClick={() => setIncidentOpen(false)}><ArrowLeft size={18} /> Feed</button>{menuItems.length > 0 && <button aria-label="Group options" onClick={() => setMenuOpen(value => !value)}><MoreHorizontal size={20} /></button>}{menuOpen && menu}</div>
        <div className="social-incident-content" ref={incidentClueRef}>
          <div className="social-post encounter-post">
            <div className="post-avatar" style={{ background: '#8c5c68' }}>!</div>
            <div className="post-body">
              <div className="post-head"><strong>{incident.trigger.sender}</strong><span>{incident.trigger.title}</span></div>
              <p data-clue-target={incidentClueIds[0]}>{incident.trigger.message}</p>
              {bookmarks.length > 0 && <div className="post-actions">{savePost}</div>}
            </div>
          </div>
        <div className="social-thread" aria-label={`${incident.trigger.sender} discussion`}>
          {incident.thread.map((message, index) => (
            <article
              key={index}
              className={`social-thread-item ${message.from}`}
              data-clue-target={incidentClueIds.length > 1 && index === 0
                ? incidentClueIds[1]
                : incidentClueIds.length > 2 && index === incident.thread.length - 1
                  ? incidentClueIds[2]
                  : undefined}
            >
              <strong>{message.from === 'me' ? data?.profile.name ?? 'Me' : message.sender ?? 'Notice'}</strong>
              <p>{message.text}</p>
              {message.time && <time>{message.time}</time>}
            </article>
          ))}
          {(sentComments[incident.id] ?? []).map((comment, index) => <article key={`comment-${index}`} className="social-thread-item me"><strong>{data?.profile.name ?? 'Me'}</strong><p>{comment}</p><time>now</time></article>)}
          <ReadMarker key={target} onRead={() => onPhoneEvent?.({ kind: 'MESSAGE_READ', app: 'social', target })} />
          {renderReplyComposer(incident.id)}
        </div>
        </div>
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
        {supportingSocialArtifacts.map(artifact => (
          <button
            className="social-post social-post-button"
            key={artifact.id}
            onClick={() => setSelectedReferenceId(artifact.id)}
          >
            <div className="post-avatar" style={{ background: '#8c5c68' }}>{encounter?.trigger.sender[0] ?? '!'}</div>
            <div className="post-body">
              <div className="post-head"><strong>{artifact.label}</strong><span>Account activity · now</span></div>
              <p>{artifact.detail}</p>
            </div>
          </button>
        ))}
        {posts.map(post => (
          <button className="social-post social-post-button" key={post.id} onClick={() => setSelectedPostId(post.id)}>
            <div className="post-avatar" style={{ background: post.color }}>{post.user[0]}</div>
            <div className="post-body">
              <div className="post-head"><strong>{post.user}</strong><span>{post.handle} · {post.time}</span></div>
              <p>{post.text}</p>
              <div className="post-actions"><span><Heart size={16} /> {post.likes}</span><span><MessageCircle size={16} /> {post.comments}</span><Share2 size={16} /></div>
            </div>
          </button>
        ))}
      </div>
      {replies.length > 0 && <section className="social-compose"><span>Write a post</span>{renderReplyComposer('feed')}{(sentComments.feed ?? []).map((post, index) => <p key={`post-${index}`} className="social-sent-comment">{post}</p>)}</section>}
    </div>
  )
}
