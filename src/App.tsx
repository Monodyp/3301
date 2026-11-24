import { useEffect, useState } from 'react'
import type { AppId, GameNotification } from './types'
import { PhoneShell } from './components/phone/PhoneShell'
import { HomeScreen } from './components/phone/HomeScreen'
import { NotificationManager } from './components/notifications/NotificationManager'
import { DeveloperPanel } from './components/developer/DeveloperPanel'
import { MessagesApp } from './components/applications/MessagesApp'
import { SocialApp } from './components/applications/SocialApp'
import { EmailApp } from './components/applications/EmailApp'
import { BrowserApp } from './components/applications/BrowserApp'
import { ContactsApp } from './components/applications/ContactsApp'
import { CallsApp } from './components/applications/CallsApp'
import { WalletApp } from './components/applications/WalletApp'
import { SettingsApp } from './components/applications/SettingsApp'
import { useHorrorState } from './hooks/useHorrorState'
import { useGame } from './game/useGame'
import { useGameEffects } from './game/useGameEffects'
import { EnginePanel } from './components/developer/EnginePanel'
import { getCharacterPhoneData } from './data/characterData'
import { ArtifactLayer, DecisionSheet, EvidenceTray, InvestigationHints } from './components/investigation/InvestigationUI'
import { SpecializedApp } from './components/applications/SpecializedApp'
import { FeedbackCard, ResultsScreen } from './components/results/Priority4Cards'

const initialUnread: Record<AppId, number> = {
  messages: 2, social: 1, email: 2, browser: 0, contacts: 0, calls: 1, wallet: 0, settings: 0,
  livestream: 0, marketplace: 0, wifi: 0, jobs: 0, ctf: 0,
}

function App() {
  const [openedApp, setOpenedApp] = useState<AppId | null>(null)
  const [intro, setIntro] = useState(true)
  const [selectedCharacter, setSelectedCharacter] = useState(
    () => new URLSearchParams(window.location.search).get('character')?.toLowerCase() === 'rafa' ? 'rafa' : 'mika',
  )
  const [notification, setNotification] = useState<GameNotification | null>(null)
  const [unread, setUnread] = useState(initialUnread)
  const [incomingCall, setIncomingCall] = useState(false)
  const horror = useHorrorState()
  const { setStage } = horror
  const game = useGame()
  // Idle-based hints and glitches on wrong answers (horror stage and pacing are below).
  useGameEffects(game, horror)
  const isDev = new URLSearchParams(window.location.search).get('dev') === '1'
  const characterOverride = selectedCharacter
  const characterData = getCharacterPhoneData(characterOverride ?? game.character?.id)

  useEffect(() => {
    setStage(game.horrorStage)
  }, [game.horrorStage, setStage])

  useEffect(() => {
    if (game.state.phase !== 'MAIN_MENU') {
      setIntro(false)
    }
  }, [game.state.phase])

  useEffect(() => {
    if (game.character?.id && game.character.id !== selectedCharacter) {
      setSelectedCharacter(game.character.id)
    }
  }, [game.character?.id, selectedCharacter])

  useEffect(() => {
    if (isDev) return
    if (game.state.phase !== 'PHONE_IDLE') return
    let timer: number | null = null
    const schedule = () => {
      if (document.visibilityState !== 'visible') return
      timer = window.setTimeout(() => game.actions.triggerEncounter(), 4000)
    }
    const onVisibility = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = null
      schedule()
    }
    schedule()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      if (timer !== null) window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [isDev, game.state.phase, game.actions.triggerEncounter])

  useEffect(() => {
    const encounter = game.encounter
    if (!encounter) return
    if (game.state.phase === 'ENCOUNTER_INTRO') {
      setNotification({
        id: encounter.id,
        title: encounter.trigger.title,
        message: encounter.trigger.message,
        source: encounter.trigger.app,
        timestamp: 'now',
        unreadIncrement: true,
      })
      setUnread(current => ({
        ...current,
        [encounter.trigger.app]: current[encounter.trigger.app] + 1,
      }))
    }
  }, [game.encounter, game.state.phase])

  const enterPhone = () => {
    setIntro(false)
    if (game.state.phase === 'MAIN_MENU' || game.state.characterId !== selectedCharacter) {
      game.actions.startRun({ characterId: selectedCharacter })
      window.setTimeout(() => game.actions.enterPhone(), 0)
    }
  }

  const continueToNextAttack = () => {
    game.actions.continue()
    game.actions.nextEncounter()
  }

  const playAgain = () => {
    setOpenedApp(null)
    setNotification(null)
    setIncomingCall(false)
    setUnread(initialUnread)
    game.actions.playAgain()
  }

  const openApp = (id: AppId) => {
    setOpenedApp(id)
    setUnread(current => ({ ...current, [id]: 0 }))
    if (game.state.phase === 'ENCOUNTER_INTRO') {
      if (id === 'calls' && game.encounter?.trigger.app === 'calls') setIncomingCall(true)
      game.actions.beginInvestigation()
    }
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
    setUnread(current => ({ ...current, email: current.email + 1 }))
  }

  const reset = () => {
    horror.reset()
    game.actions.devReset()
    setNotification(null)
    setIncomingCall(false)
    setOpenedApp(null)
    setUnread(initialUnread)
  }

  const renderApp = () => {
    if (incomingCall) return <CallsApp incoming data={characterData} encounter={game.encounter} dismissCall={() => setIncomingCall(false)} onReject={voicemail => {
      setNotification({ id: `voicemail-${Date.now()}`, title: 'Missed call', message: voicemail, source: 'calls', timestamp: 'now', unreadIncrement: true })
      setUnread(current => ({ ...current, calls: current.calls + 1 }))
    }} />
    switch (openedApp) {
      case 'messages': return <MessagesApp data={characterData} encounter={game.encounter} />
      case 'social': return <SocialApp data={characterData} encounter={game.encounter} />
      case 'email': return <EmailApp data={characterData} encounter={game.encounter} />
      case 'browser': return <BrowserApp data={characterData} encounter={game.encounter} />
      case 'contacts': return <ContactsApp data={characterData} encounter={game.encounter} />
      case 'calls': return <CallsApp data={characterData} encounter={game.encounter} dismissCall={() => setIncomingCall(false)} />
      case 'wallet': return <WalletApp data={characterData} balance={game.state.walletBalance} consequences={game.state.consequences} />
      case 'settings': return <SettingsApp
        data={characterData}
        accountSecurity={game.state.accountSecurity}
        hints={game.hintsShown}
        completedTasks={game.state.completedSecurityTasks}
        onCompleteTask={game.actions.completeSecurityTask}
      />
      case 'livestream':
      case 'marketplace':
      case 'wifi':
      case 'jobs':
      case 'ctf':
        return <SpecializedApp mode={openedApp} data={characterData} onInspect={artifactId => game.actions.inspect(artifactId)} />
      default: return null
    }
  }

  return (
    <div className="game-root">
      {intro ? (
        <div className="opening-screen">
          <div className="opening-sigil">3301</div>
          <p>YOU ARE</p>
          <h1>{characterData.profile.name.toUpperCase()}</h1>
          <span>{characterData.profile.location} · 11:47 PM</span>
          <div className="character-picker" aria-label="Character selection">
            {['mika', 'rafa'].map(id => (
              <button key={id} className={selectedCharacter === id ? 'selected' : ''} onClick={() => setSelectedCharacter(id)}>
                {getCharacterPhoneData(id).profile.name}
              </button>
            ))}
          </div>
          <button onClick={enterPhone}>Enter phone</button>
        </div>
      ) : (
        <PhoneShell
          simulatedTime="11:47"
          onBack={() => openedApp ? setOpenedApp(null) : undefined}
          onHome={() => { setOpenedApp(null); setIncomingCall(false) }}
          horrorStage={horror.stage}
          glitchActive={horror.glitchActive}
          glitchId={horror.glitchId}
          warningVisible={horror.warningVisible}
          warningId={horror.warningId}
          dismissWarning={horror.dismissWarning}
        >
          {openedApp || incomingCall ? renderApp() : <HomeScreen openApp={openApp} unread={unread} data={characterData} />}
          {game.state.phase === 'CHARACTER_ASSIGNMENT' && (
            <aside className="character-assignment" role="dialog" aria-label="Character assignment">
              <span>Character assigned</span>
              <strong>{characterData.profile.name}</strong>
              <p>{game.character?.objective}</p>
              <button onClick={game.actions.enterPhone}>Enter phone</button>
            </aside>
          )}
          {['PHONE_IDLE', 'ENCOUNTER_INTRO', 'INVESTIGATION', 'DECISION', 'CONSEQUENCE', 'ENCOUNTER_COMPLETE'].includes(game.state.phase) && (
            <EvidenceTray game={game} openApp={openApp} />
          )}
          {game.state.phase === 'INVESTIGATION' && (
            <>
              <ArtifactLayer game={game} app={openedApp} />
              <InvestigationHints game={game} />
              <button className="make-decision-button" onClick={game.actions.openDecision}>Make decision</button>
            </>
          )}
          {game.state.phase === 'DECISION' && (
            <>
              <DecisionSheet game={game} />
              <InvestigationHints game={game} />
            </>
          )}
          {game.state.phase === 'CONSEQUENCE' && game.lastDecision && (
            <FeedbackCard game={game} onContinue={continueToNextAttack} />
          )}
          {game.state.phase === 'RESULTS' && (
            <ResultsScreen game={game} onPlayAgain={playAgain} />
          )}
          <NotificationManager notification={notification} openApp={openApp} />
        </PhoneShell>
      )}
      {isDev && (
        <DeveloperPanel
          selectedStage={horror.stage}
          setStage={horror.setStage}
          triggerNotification={triggerNotification}
          triggerCall={() => setIncomingCall(true)}
          triggerGlitch={horror.triggerGlitch}
          reset={reset}
        />
      )}
      {isDev && <EnginePanel game={game} />}
    </div>
  )
}

export default App
