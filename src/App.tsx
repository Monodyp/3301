import { useEffect, useState } from 'react'
import type { AppId, GameNotification, HorrorStage } from './types'
import { PhoneShell } from './components/phone/PhoneShell'
import { HomeScreen } from './components/phone/HomeScreen'
import { NotificationManager } from './components/notifications/NotificationManager'
import { HorrorOverlay } from './components/horror/HorrorOverlay'
import { DeveloperPanel } from './components/developer/DeveloperPanel'
import { MessagesApp } from './components/applications/MessagesApp'
import { SocialApp } from './components/applications/SocialApp'
import { EmailApp } from './components/applications/EmailApp'
import { BrowserApp } from './components/applications/BrowserApp'
import { ContactsApp } from './components/applications/ContactsApp'
import { CallsApp } from './components/applications/CallsApp'
import { WalletApp } from './components/applications/WalletApp'
import { SettingsApp } from './components/applications/SettingsApp'

const initialUnread: Record<AppId, number> = {
  messages: 2, social: 1, email: 2, browser: 0, contacts: 0, calls: 1, wallet: 0, settings: 0,
}

function App() {
  const [openedApp, setOpenedApp] = useState<AppId | null>(null)
  const [intro, setIntro] = useState(true)
  const [horrorStage, setHorrorStage] = useState<HorrorStage>('NORMAL')
  const [notification, setNotification] = useState<GameNotification | null>(null)
  const [unread, setUnread] = useState(initialUnread)
  const [incomingCall, setIncomingCall] = useState(false)
  const [glitchKey, setGlitchKey] = useState(0)
  const isDev = new URLSearchParams(window.location.search).get('dev') === '1'

  useEffect(() => {
    const suspiciousTimer = window.setTimeout(() => {
      setNotification({
        id: 'first-incident',
        title: 'Unknown message',
        message: 'You opened this? 3301',
        source: 'messages',
        timestamp: 'now',
        unreadIncrement: true,
      })
      setHorrorStage('UNSETTLED')
      setUnread(current => ({ ...current, messages: current.messages + 1 }))
    }, 30000)
    return () => window.clearTimeout(suspiciousTimer)
  }, [])

  const openApp = (id: AppId) => {
    setOpenedApp(id)
    setUnread(current => ({ ...current, [id]: 0 }))
  }

  const triggerNotification = () => {
    setNotification({
      id: `test-${Date.now()}`,
      title: 'Archive sync',
      message: 'A new file is available.',
      source: 'email',
      timestamp: 'now',
      unreadIncrement: true,
    })
  }

  const triggerGlitch = () => setGlitchKey(key => key + 1)

  const reset = () => {
    setHorrorStage('NORMAL')
    setNotification(null)
    setIncomingCall(false)
    setOpenedApp(null)
    setUnread(initialUnread)
  }

  const renderApp = () => {
    if (incomingCall) return <CallsApp incoming dismissCall={() => setIncomingCall(false)} />
    switch (openedApp) {
      case 'messages': return <MessagesApp />
      case 'social': return <SocialApp />
      case 'email': return <EmailApp />
      case 'browser': return <BrowserApp />
      case 'contacts': return <ContactsApp />
      case 'calls': return <CallsApp dismissCall={() => setIncomingCall(false)} />
      case 'wallet': return <WalletApp />
      case 'settings': return <SettingsApp />
      default: return null
    }
  }

  return (
    <div className="game-root">
      {intro ? (
        <div className="opening-screen">
          <div className="opening-sigil">3301</div>
          <p>YOU ARE</p>
          <h1>AVERY</h1>
          <span>Northbridge · 11:47 PM</span>
          <button onClick={() => setIntro(false)}>Enter phone</button>
        </div>
      ) : (
        <PhoneShell
          simulatedTime="11:47"
          onBack={() => openedApp ? setOpenedApp(null) : undefined}
          onHome={() => { setOpenedApp(null); setIncomingCall(false) }}
        >
          {openedApp || incomingCall ? renderApp() : <HomeScreen openApp={openApp} unread={unread} />}
          <NotificationManager notification={notification} openApp={openApp} />
        </PhoneShell>
      )}
      <HorrorOverlay stage={horrorStage} glitchKey={glitchKey} />
      {isDev && (
        <DeveloperPanel
          setStage={setHorrorStage}
          triggerNotification={triggerNotification}
          triggerCall={() => setIncomingCall(true)}
          triggerGlitch={triggerGlitch}
          reset={reset}
        />
      )}
    </div>
  )
}

export default App
