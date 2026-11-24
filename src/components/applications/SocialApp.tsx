import { Heart, MessageCircle, Share2 } from 'lucide-react'
import type { CharacterPhoneData } from '../../data/characterData'
import type { Encounter } from '../../game/types'

export function SocialApp({ data, encounter }: { data?: CharacterPhoneData; encounter?: Encounter }) {
  const posts = data?.socialPosts ?? []
  return (
    <div className="app-content">
      <div className="app-title-row"><h2>Social</h2><button>•••</button></div>
      <div className="stories">
        {(data?.stories ?? []).map(story => (
          <div key={story.name}><span style={{ background: story.color }}>{story.name[0]}</span><small>{story.name}</small></div>
        ))}
      </div>
      <div className="social-feed">
        {encounter?.trigger.app === 'social' && (
          <article className="social-post encounter-post">
            <div className="post-avatar" style={{ background: '#8c5c68' }}>!</div>
            <div className="post-body">
              <div className="post-head"><strong>{encounter.trigger.sender}</strong><span>Encounter · now</span></div>
              <p>{encounter.trigger.message}</p>
            </div>
          </article>
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
    </div>
  )
}
