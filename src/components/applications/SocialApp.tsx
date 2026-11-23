import { Heart, MessageCircle, Share2 } from 'lucide-react'
import { socialPosts } from '../../data/mockData'

export function SocialApp() {
  return (
    <div className="app-content">
      <div className="app-title-row"><h2>Social</h2><button>•••</button></div>
      <div className="stories">
        {['Mara', 'Theo', 'Lena', 'Nora'].map((name, index) => (
          <div key={name}><span style={{ background: ['#b69bdf','#78a8a0','#ca8f92','#8397b5'][index] }}>{name[0]}</span><small>{name}</small></div>
        ))}
      </div>
      <div className="social-feed">
        {socialPosts.map(post => (
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
