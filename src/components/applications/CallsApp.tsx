import { useEffect, useRef, useState } from 'react'
import { Phone, PhoneOff, Play, Video } from 'lucide-react'
import type { CharacterPhoneData } from '../../data/characterData'
import type { Encounter, PhoneEvent } from '../../game/types'
import { PHONE_TARGETS } from '../../game/narrative'

// Reports CONVERSATION_OPENED when the incoming call screen appears,
// CALL_COMPLETED when an answered call is ended, and MESSAGE_READ when a
// voicemail is played.
export function CallsApp({ incoming = false, dismissCall, onReject, onPhoneEvent, data, encounter, voicemails = [] }: {
  incoming?: boolean
  dismissCall?: () => void
  onReject?: (voicemail: string) => void
  onPhoneEvent?: (event: PhoneEvent) => void
  data?: CharacterPhoneData
  encounter?: Encounter
  voicemails?: readonly { id: string; caller: string; message: string }[]
}) {
  const [screen, setScreen] = useState(incoming ? 'incoming' : 'recent')
  const [answered, setAnswered] = useState(false)
  const [played, setPlayed] = useState<string[]>([])
  const incomingCall = encounter?.incomingCall
  const incident = encounter && incomingCall ? PHONE_TARGETS.incident(encounter.id) : null

  const reportedOpen = useRef(false)
  useEffect(() => {
    if (!incoming || !incident || reportedOpen.current) return
    reportedOpen.current = true
    onPhoneEvent?.({ kind: 'CONVERSATION_OPENED', app: 'calls', target: incident })
  }, [incoming, incident, onPhoneEvent])

  const playVoicemail = (id: string) => {
    if (played.includes(id)) return
    setPlayed(current => [...current, id])
    const target = encounter && id.endsWith(`-${encounter.id}`) ? PHONE_TARGETS.voicemail(encounter.id) : PHONE_TARGETS.ambient('calls', id)
    onPhoneEvent?.({ kind: 'MESSAGE_READ', app: 'calls', target })
  }

  if (screen === 'incoming') return (
    <div className="incoming-call">
      <span>Incoming call</span>
      <div className="caller-avatar" style={{ background: incomingCall?.callerColor }}>{incomingCall?.caller[0] ?? '3301'}</div>
      <h2>{incomingCall?.caller ?? 'Unknown'}</h2>
      <p>{incomingCall?.context ?? 'Private number'}</p>
      {answered && incomingCall && <p className="call-content" aria-live="polite">{incomingCall.content}</p>}
      <div className="call-actions">
        <button className="decline" aria-label="Reject call" onClick={() => { setScreen('recent'); dismissCall?.(); if (incomingCall) onReject?.(incomingCall.voicemail) }}><PhoneOff /></button>
        <button className={`accept ${answered ? 'answered' : ''}`} aria-label={answered ? 'End call' : 'Answer call'} onClick={() => {
          if (answered) {
            if (incident) onPhoneEvent?.({ kind: 'CALL_COMPLETED', app: 'calls', target: incident })
            setScreen('recent'); setAnswered(false); dismissCall?.(); return
          }
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
      {voicemails.map(voicemail => (
        <button className="voicemail-record" key={voicemail.id} onClick={() => playVoicemail(voicemail.id)} aria-expanded={played.includes(voicemail.id)}>
          <strong><Play size={13} /> Voicemail · {voicemail.caller}</strong>
          {played.includes(voicemail.id) ? <p>{voicemail.message}</p> : <p className="voicemail-hint">Tap to play</p>}
        </button>
      ))}
      <button className="keypad-button"><Video size={18} /> Start call</button>
    </div>
  )
}
