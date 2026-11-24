import { useState } from 'react'
import { Phone, PhoneOff, Video } from 'lucide-react'
import type { CharacterPhoneData } from '../../data/characterData'
import type { Encounter } from '../../game/types'

export function CallsApp({ incoming = false, dismissCall, onReject, data, encounter }: { incoming?: boolean; dismissCall?: () => void; onReject?: (voicemail: string) => void; data?: CharacterPhoneData; encounter?: Encounter }) {
  const [screen, setScreen] = useState(incoming ? 'incoming' : 'recent')
  const [answered, setAnswered] = useState(false)
  const incomingCall = encounter?.incomingCall
  if (screen === 'incoming') return (
    <div className="incoming-call">
      <span>Incoming call</span>
      <div className="caller-avatar" style={{ background: incomingCall?.callerColor }}>{incomingCall?.caller[0] ?? '3301'}</div>
      <h2>{incomingCall?.caller ?? 'Unknown'}</h2>
      <p>{incomingCall?.context ?? 'Private number'}</p>
      {answered && incomingCall && <p className="call-content">{incomingCall.content}</p>}
      <div className="call-actions">
        <button className="decline" aria-label="Reject call" onClick={() => { setScreen('recent'); dismissCall?.(); if (incomingCall) onReject?.(incomingCall.voicemail) }}><PhoneOff /></button>
        <button className={`accept ${answered ? 'answered' : ''}`} aria-label={answered ? 'End call' : 'Answer call'} onClick={() => {
          if (answered) { setScreen('recent'); setAnswered(false); dismissCall?.(); return }
          setAnswered(true)
          if (!incomingCall) { setScreen('recent'); dismissCall?.() }
        }}><Phone /></button>
      </div>
    </div>
  )
  return (
    <div className="app-content">
      <div className="app-title-row"><h2>Recent</h2><button>Edit</button></div>
      {(data?.calls ?? [
        { name: 'Mara Vale', detail: 'Mobile · 11:48', status: 'missed' as const, color: '#b69bd6' },
        { name: 'Theo Park', detail: 'Incoming · Yesterday', status: 'normal' as const, color: '#78a9a0' },
        { name: 'Lena Ortiz', detail: 'Outgoing · Monday', status: 'normal' as const, color: '#c88f92' },
      ]).map(call => (
        <button className="call-row" key={call.name}>
          <div className="avatar" style={{ background: call.color }}>{call.name[0]}</div>
          <div><strong className={call.status}>{call.name}</strong><span>{call.detail}</span></div>
          <Phone size={17} />
        </button>
      ))}
      <button className="keypad-button"><Video size={18} /> Start call</button>
    </div>
  )
}
