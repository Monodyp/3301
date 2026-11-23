import { useState } from 'react'
import { Phone, PhoneOff, Video } from 'lucide-react'

export function CallsApp({ incoming = false, dismissCall }: { incoming?: boolean; dismissCall?: () => void }) {
  const [screen, setScreen] = useState(incoming ? 'incoming' : 'recent')
  if (screen === 'incoming') return (
    <div className="incoming-call">
      <span>Incoming call</span>
      <div className="caller-avatar">3301</div>
      <h2>Unknown</h2>
      <p>Private number</p>
      <div className="call-actions">
        <button className="decline" onClick={() => { setScreen('recent'); dismissCall?.() }}><PhoneOff /></button>
        <button className="accept" onClick={() => { setScreen('recent'); dismissCall?.() }}><Phone /></button>
      </div>
    </div>
  )
  return (
    <div className="app-content">
      <div className="app-title-row"><h2>Recent</h2><button>Edit</button></div>
      {[
        ['Mara Vale', 'Mobile · 11:48', 'missed'],
        ['Theo Park', 'Incoming · Yesterday', 'normal'],
        ['Lena Ortiz', 'Outgoing · Monday', 'normal'],
      ].map((call, index) => (
        <button className="call-row" key={call[0]}>
          <div className="avatar" style={{ background: ['#b69bd6','#78a9a0','#c88f92'][index] }}>{call[0][0]}</div>
          <div><strong className={call[2]}>{call[0]}</strong><span>{call[1]}</span></div>
          <Phone size={17} />
        </button>
      ))}
      <button className="keypad-button"><Video size={18} /> Start call</button>
    </div>
  )
}
