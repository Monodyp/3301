import { useState } from 'react'
import type { CharacterPhoneData } from '../../data/characterData'
import type { AppId } from '../../types'

export function SpecializedApp({ mode, data, onInspect }: {
  mode: Extract<AppId, 'livestream' | 'marketplace' | 'wifi' | 'jobs' | 'ctf'>
  data: CharacterPhoneData
  onInspect?: (artifactId: string) => void
}) {
  const [completed, setCompleted] = useState<string[]>([])
  const mark = (id: string) => setCompleted(current => current.includes(id) ? current : [...current, id])

  if (mode === 'livestream') {
    const content = data.specializedContent.livestream
    return (
      <div className="app-content specialized-app">
        <h2>{content?.title ?? 'Livestream Dashboard'}</h2>
        <div className="live-status"><b>{content?.status ?? 'Offline'}</b><span>{content?.viewers ?? 0} viewers</span></div>
        <p>{content?.message ?? 'Manage the stream preview and moderation tools.'}</p>
        <button onClick={() => mark('livestream-preview')}>{completed.includes('livestream-preview') ? 'Preview checked' : 'Check stream preview'}</button>
        {content?.evidenceId && <button className="specialized-evidence" onClick={() => onInspect?.(content.evidenceId!)}>Inspect evidence</button>}
      </div>
    )
  }
  if (mode === 'marketplace') {
    const content = data.specializedContent.marketplace
    return (
      <div className="app-content specialized-app">
        <h2>{content?.title ?? 'Marketplace Inbox'}</h2>
        {(content?.listings ?? [{ id: 'order-1', title: 'No new listings', detail: 'Check verified sellers only.' }]).map(item => (
          <button key={item.id} className={item.suspicious ? 'suspicious-listing' : ''} onClick={() => mark(item.id)}>
            <strong>{item.title}</strong><span>{item.detail}</span><small>{completed.includes(item.id) ? 'Checked' : 'Tap to check'}</small>
          </button>
        ))}
        {content?.evidenceId && <button className="specialized-evidence" onClick={() => onInspect?.(content.evidenceId!)}>Inspect evidence</button>}
      </div>
    )
  }
  if (mode === 'wifi') {
    const content = data.specializedContent.wifi
    return (
      <div className="app-content specialized-app">
        <h2>{content?.portalTitle ?? 'Wi-Fi Portal'}</h2>
        <b className="wifi-network">{content?.network ?? data.settings.wifi}</b>
        <p>{content?.warning ?? 'Never enter real credentials on a public portal preview.'}</p>
        {(content?.fields ?? ['Guest name', 'Practice code']).map(field => <div className="portal-field" key={field}>{field}<span>Practice only</span></div>)}
        {content?.evidenceId && <button className="specialized-evidence" onClick={() => onInspect?.(content.evidenceId!)}>Inspect evidence</button>}
      </div>
    )
  }
  if (mode === 'jobs') {
    const content = data.specializedContent.jobs
    return (
      <div className="app-content specialized-app">
        <h2>{content?.title ?? 'Job Board'}</h2>
        {(content?.postings ?? [{ id: 'job-1', title: 'No active listings', company: 'Verified employers only' }]).map(posting => (
          <button key={posting.id} className={posting.warning ? 'suspicious-listing' : ''} onClick={() => mark(posting.id)}>
            <strong>{posting.title}</strong><span>{posting.company}</span>{posting.warning && <small>{posting.warning}</small>}
          </button>
        ))}
        {content?.evidenceId && <button className="specialized-evidence" onClick={() => onInspect?.(content.evidenceId!)}>Inspect evidence</button>}
      </div>
    )
  }
  const content = data.specializedContent.ctf
  return (
    <div className="app-content specialized-app">
      <h2>{content?.title ?? 'Practice CTF'}</h2>
      {(content?.challenges ?? [
        { id: 'ctf-1', title: 'Inspect a suspicious URL', points: 100, solved: false },
        { id: 'ctf-2', title: 'Verify a sender', points: 150, solved: false },
      ]).map(challenge => (
        <button key={challenge.id} onClick={() => mark(challenge.id)}>
          <strong>{challenge.title}</strong><span>{challenge.points} pts</span><small>{completed.includes(challenge.id) ? 'Solved' : 'Solve'}</small>
        </button>
      ))}
      {content?.evidenceId && <button className="specialized-evidence" onClick={() => onInspect?.(content.evidenceId!)}>Inspect evidence</button>}
    </div>
  )
}
