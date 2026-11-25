import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { AppId, GameNotification } from './types'
import { playGlitchSound, playNotificationOnce, startBackgroundMusic } from './game/audio'
import { PhoneShell } from './components/phone/PhoneShell'
import { HomeScreen } from './components/phone/HomeScreen'
import { OpeningSequence } from './components/phone/OpeningSequence'
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
import { ProtectiveActionCard } from './components/applications/ProtectiveActionCard'
import { useHorrorState } from './hooks/useHorrorState'
import { useGame } from './game/useGame'
import { useGameEffects } from './game/useGameEffects'
import { EnginePanel } from './components/developer/EnginePanel'
import { getCharacterPhoneData } from './data/characterData'
import { DecisionSheet, EvidenceTray, InvestigationHints, PendingDecisionChip } from './components/investigation/InvestigationUI'
import { ClueCards } from './components/investigation/ClueCards'
import { SpecializedApp } from './components/applications/SpecializedApp'
import { addVoicemail, loadVoicemails, saveVoicemails } from './components/applications/voicemailStorage'
import { FeedbackCard, ResultsScreen } from './components/results/Priority4Cards'
import { JoinSessionScreen } from './components/event/JoinSessionScreen'
import { hasSupabaseConfiguration, isSupabaseConfigured } from './lib/supabase'
import { loadStoredParticipant } from './event/participant'
import type { PhoneSurface } from './game/scenarioRegistry'
import { NARRATIVE_CONTENT, hasPresented } from './game/narrative'
import { OrganizerDashboard } from './components/admin/OrganizerDashboard'

const initialUnread: Record<AppId, number> = {
  messages: 2, social: 1, email: 2, browser: 0, contacts: 0, calls: 1, wallet: 0, settings: 0,
  livestream: 0, marketplace: 0, wifi: 0, jobs: 0, ctf: 0,
}

function App() {
  const [openedApp, setOpenedApp] = useState<AppId | null>(null)
  const [intro, setIntro] = useState(true)
  const [mode, setMode] = useState<'local' | 'event' | 'playing'>(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('mode') === 'local') return 'local'
    if (params.get('mode') === 'event') return 'event'
    return import.meta.env.PROD
      || hasSupabaseConfiguration
      || loadStoredParticipant()
      || params.has('session')
      ? 'event'
      : 'local'
  })
  const [eventRun, setEventRun] = useState(() => Boolean(loadStoredParticipant()?.eventRunStarted))
  const [eventPlayerName, setEventPlayerName] = useState(() => loadStoredParticipant()?.nickname ?? 'Player')
  const [selectedCharacter, setSelectedCharacter] = useState(
    () => new URLSearchParams(window.location.search).get('character')?.toLowerCase() === 'rafa' ? 'rafa' : 'mika',
  )
  const isEventMode = mode === 'event' || (mode === 'playing' && eventRun)
  // Notifications on screen: at most one ordinary and one cyberattack notification, attack on top.
  const [notifications, setNotifications] = useState<GameNotification[]>([])
  const dismissNotification = useCallback((id: string) => setNotifications(current => current.filter(n => n.id !== id)), [])
  const [unread, setUnread] = useState(initialUnread)
  const [incomingCall, setIncomingCall] = useState(false)
  const [voicemails, setVoicemails] = useState<{ id: string; caller: string; message: string }[]>([])
  const [openingSequence, setOpeningSequence] = useState(false)
  const horror = useHorrorState()
  const { setStage } = horror
  const game = useGame(isEventMode ? 'event' : 'practice')
  const notify = useCallback((item: GameNotification, playSound = true) => {
    if (playSound) {
      playNotificationOnce(`${game.state.sessionId ?? 'no-session'}:${item.id}`, item.variant === 'attack')
    }
    const isAttack = (n: GameNotification) => n.variant === 'attack'
    setNotifications(current => [...current.filter(n => isAttack(n) !== isAttack(item)), item].sort((a, b) => Number(isAttack(b)) - Number(isAttack(a))))
  }, [game.state.sessionId])
  // Idle-based hints and glitches on wrong answers (horror stage and pacing are below).
  useGameEffects(game, horror)
  const isDev = new URLSearchParams(window.location.search).get('dev') === '1'
  const phoneCharacterId = isEventMode
    ? game.encounter?.characterId ?? game.storyCharacter?.id
    : selectedCharacter ?? game.storyCharacter?.id
  const characterData = getCharacterPhoneData(phoneCharacterId)

  useEffect(() => {
    setStage(game.horrorStage)
  }, [game.horrorStage, setStage])

  useEffect(() => {
    if (game.state.phase !== 'MAIN_MENU') {
      setIntro(false)
    }
  }, [game.state.phase])

  useEffect(() => {
    if (!isEventMode && game.storyCharacter?.id && game.storyCharacter.id !== selectedCharacter) {
      setSelectedCharacter(game.storyCharacter.id)
    }
  }, [game.storyCharacter?.id, isEventMode, selectedCharacter])

  useEffect(() => {
    setVoicemails(loadVoicemails(game.state.sessionId))
  }, [game.state.sessionId])

  // A decision notification appears once, when the engine validates a pending decision.
  const pendingDecisionId = game.pendingDecision?.id
  const lastDecisionNotificationId = useRef(pendingDecisionId)
  useEffect(() => {
    const encounter = game.encounter
    const isNewDecision = lastDecisionNotificationId.current !== pendingDecisionId
    lastDecisionNotificationId.current = pendingDecisionId
    if (!pendingDecisionId || !encounter) return
    notify({
      id: `decision-${pendingDecisionId}`,
      title: 'Decision ready',
      message: `Respond to ${encounter.trigger.sender}: ${encounter.prompt}`,
      source: encounter.trigger.app,
      timestamp: 'now',
      decisionId: pendingDecisionId,
    }, isNewDecision)
  }, [game.encounter, pendingDecisionId, notify])

  // The next incident arrives as soon as the engine has unlocked it and the
  // phone is on screen. The engine decides when one is due (first encounter on
  // entering the phone, later ones once the previous encounter is resolved);
  // there is no idle timer and opening apps does not trigger anything.
  const phoneVisible = mode !== 'event' && !intro && !openingSequence
  const { incidentDue } = game
  const { triggerEncounter } = game.actions
  useEffect(() => {
    if (incidentDue && phoneVisible) triggerEncounter()
  }, [incidentDue, phoneVisible, triggerEncounter])

  // Cyberattack notifications. Each incident is a scripted cyberattack; when
  // the engine triggers it (the incident arrives), its authored notification
  // is shown once, styled by the attack's escalation tier, and recorded as
  // shown so a refresh never repeats it.
  const { attackDue } = game
  const { attackNotified } = game.actions
  useEffect(() => {
    if (!attackDue || !phoneVisible) return
    playGlitchSound('heavy', `${game.state.sessionId ?? 'no-session'}:${attackDue.id}`, true)
    notify({
      id: attackDue.id,
      variant: 'attack',
      tier: attackDue.tier,
      tierLabel: `${attackDue.tierLabel} · Attack ${attackDue.ordinal}`,
      title: attackDue.title,
      message: attackDue.message,
      detail: attackDue.detail,
      source: attackDue.app,
      timestamp: 'now',
      unreadIncrement: true,
    })
    setUnread(current => ({ ...current, [attackDue.app]: current[attackDue.app] + 1 }))
    attackNotified(attackDue.id)
  }, [attackDue, phoneVisible, notify, attackNotified, game.state.sessionId])

  const enterPhone = () => {
    setIntro(false)
    if (isEventMode) {
      if (game.state.runMode === 'event') setOpeningSequence(true)
      return
    }
    if (game.state.phase === 'MAIN_MENU' || game.state.characterId !== selectedCharacter) {
      game.actions.startRun({ characterId: selectedCharacter })
      setOpeningSequence(true)
    }
  }

  const continueToNextAttack = () => {
    game.actions.continue()
    game.actions.nextEncounter()
  }

  const playAgain = () => {
    if (isEventMode) {
      setMode('event')
      setIntro(false)
      setOpeningSequence(false)
      setOpenedApp(null)
      return
    }
    setOpenedApp(null)
    setNotifications([])
    setIncomingCall(false)
    setVoicemails([])
    setOpeningSequence(true)
    setUnread(initialUnread)
    game.actions.playAgain()
  }

  // Opening an app only navigates. The apps report meaningful actions (opening
  // the incident, reading to the end, finishing a call) to the engine.
  const callEncounter = game.encounter?.trigger.app === 'calls' && game.encounter.incomingCall ? game.encounter : undefined
  const callAwaitingAnswer = Boolean(callEncounter
    && (game.state.phase === 'ENCOUNTER_INTRO' || game.state.phase === 'INVESTIGATION')
    && !hasPresented(game.state, NARRATIVE_CONTENT.call(callEncounter.id))
    && !voicemails.some(voicemail => voicemail.id.endsWith(`-${callEncounter.id}`)))

  const openApp = (id: AppId) => {
    setOpenedApp(id)
    setUnread(current => ({ ...current, [id]: 0 }))
    if (id === 'calls' && callAwaitingAnswer) setIncomingCall(true)
  }

  const openNotification = (item: GameNotification) => {
    dismissNotification(item.id)
    // Opens the app the notification came from (for an attack, the incident's app).
    openApp(item.source)
    if (item.decisionId) game.actions.openDecision(item.decisionId)
  }

  // Clue cards for an app's main screen or its incident view.
  const cluesIn = (app: AppId) => (surface: 'incident' | 'app'): ReactNode => <ClueCards game={game} app={app} surface={surface} />

  const triggerNotification = () => {
    notify({
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
    setNotifications([])
    setIncomingCall(false)
    setVoicemails([])
    setOpeningSequence(false)
    setOpenedApp(null)
    setUnread(initialUnread)
  }

  const renderApp = () => {
    const actionPanel = (surface: PhoneSurface) => <ProtectiveActionCard game={game} surface={surface} />
    if (incomingCall) return <CallsApp key="incoming" incoming data={characterData} encounter={game.encounter} voicemails={voicemails} onPhoneEvent={game.actions.reportPhoneEvent} dismissCall={() => setIncomingCall(false)} onReject={voicemail => {
      const caller = game.encounter?.incomingCall?.caller ?? 'Unknown caller'
      const record = { id: `voicemail-${game.state.sessionId ?? 'local'}-${game.encounter?.id ?? 'call'}`, caller, message: voicemail }
      setVoicemails(current => {
        const next = addVoicemail(current, record)
        saveVoicemails(game.state.sessionId, next)
        return next
      })
      notify({ id: `voicemail-${Date.now()}`, title: 'Missed call', message: voicemail, source: 'calls', timestamp: 'now', unreadIncrement: true })
      setUnread(current => ({ ...current, calls: current.calls + 1 }))
    }} />
    switch (openedApp) {
      case 'messages': return <MessagesApp data={characterData} encounter={game.encounter} onPhoneEvent={game.actions.reportPhoneEvent} clues={cluesIn('messages')} actionPanel={actionPanel('messages')} />
      case 'social': return <SocialApp data={characterData} encounter={game.encounter} onPhoneEvent={game.actions.reportPhoneEvent} clues={cluesIn('social')} actionPanel={actionPanel('social')} />
      case 'email': return <EmailApp data={characterData} encounter={game.encounter} onPhoneEvent={game.actions.reportPhoneEvent} clues={cluesIn('email')} actionPanel={actionPanel('email')} />
      case 'browser': return <BrowserApp data={characterData} encounter={game.encounter} character={game.storyCharacter} completedEncounterIds={game.state.completedEncounters} onPhoneEvent={game.actions.reportPhoneEvent} clues={cluesIn('browser')} actionPanel={actionPanel('browser')} />
      case 'contacts': return <ContactsApp data={characterData} encounter={game.encounter} clues={cluesIn('contacts')} actionPanel={actionPanel('contacts')} />
      case 'calls': return <CallsApp key="recent" data={characterData} encounter={game.encounter} voicemails={voicemails} onPhoneEvent={game.actions.reportPhoneEvent} dismissCall={() => setIncomingCall(false)} />
      case 'wallet': return <WalletApp data={characterData} balance={game.state.walletBalance} consequences={game.state.consequences} clues={cluesIn('wallet')} actionPanel={actionPanel('wallet')} />
      case 'settings': return <SettingsApp
        data={characterData}
        accountSecurity={game.state.accountSecurity}
        hints={game.hintsShown}
        completedTasks={game.state.completedSecurityTasks}
        onCompleteTask={game.actions.completeSecurityTask}
        securityAlerts={game.securityAlerts}
        clues={cluesIn('settings')}
        actionPanel={actionPanel('settings')}
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
    <div className="game-root" onPointerDownCapture={startBackgroundMusic} onKeyDownCapture={startBackgroundMusic}>
      {mode === 'event' ? (
        <JoinSessionScreen
          savedEventRunId={game.state.runMode === 'event' ? game.state.eventRunId : null}
          onBeginRun={run => {
            const resume = game.state.runMode === 'event'
              && game.state.eventRunId === run.id
              && game.state.encounterQueue.length === run.scenarioIds.length
              && game.state.encounterQueue.every((id, index) => id === run.scenarioIds[index])
            setEventPlayerName(loadStoredParticipant()?.nickname ?? 'Player')
            setEventRun(true)
            setMode('playing')
            if (resume) {
              setIntro(false)
              setOpeningSequence(false)
            } else {
              game.actions.startAssignedRun({ runId: run.id, scenarioIds: run.scenarioIds })
              setOpenedApp(null)
              setNotifications([])
              setIncomingCall(false)
              setVoicemails([])
              setOpeningSequence(true)
              setUnread(initialUnread)
              setIntro(false)
            }
          }}
          onLocalPractice={() => {
            setEventRun(false)
            setMode('local')
            setIntro(true)
            setOpeningSequence(false)
            setOpenedApp(null)
          }}
        />
      ) : intro ? (
        <div className="opening-screen">
          <div className="opening-sigil">3301</div>
          <div className={`opening-mode ${mode === 'playing' && eventRun ? 'opening-mode-event' : ''}`}>
            {mode === 'playing' && eventRun ? 'EVENT RUN AUTHORIZED' : 'LOCAL PRACTICE · SAVED ON THIS DEVICE'}
          </div>
          <p>{isEventMode ? 'EVENT PLAYER' : 'YOU ARE'}</p>
          <h1>{(isEventMode ? eventPlayerName : characterData.profile.name).toUpperCase()}</h1>
          <span>{isEventMode
            ? `STORY CONTEXT · ${characterData.profile.name} · ${characterData.profile.location}`
            : `${characterData.profile.location} · 11:47 PM`}</span>
          {!isEventMode && (
            <div className="character-picker" aria-label="Character selection">
              {['mika', 'rafa'].map(id => (
                <button key={id} className={selectedCharacter === id ? 'selected' : ''} onClick={() => setSelectedCharacter(id)}>
                  {getCharacterPhoneData(id).profile.name}
                </button>
              ))}
            </div>
          )}
          <button onClick={enterPhone}>Enter phone</button>
          {isSupabaseConfigured && mode === 'local' && (
            <button className="opening-secondary-button" onClick={() => setMode('event')}>Join seminar event</button>
          )}
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
          {openingSequence ? (
            <OpeningSequence data={characterData} firstEncounter={game.encounter} playerName={isEventMode ? eventPlayerName : undefined} onFinish={() => {
              setOpeningSequence(false)
              game.actions.enterPhone()
            }} />
          ) : openedApp || incomingCall ? renderApp() : <HomeScreen openApp={openApp} unread={unread} data={characterData} />}
          {!isEventMode && !openingSequence && game.state.phase === 'CHARACTER_ASSIGNMENT' && (
            <aside className="character-assignment" role="dialog" aria-label="Character assignment">
              <span>Character assigned</span>
              <strong>{characterData.profile.name}</strong>
              <p>{game.storyCharacter?.objective}</p>
              <button onClick={game.actions.enterPhone}>Enter phone</button>
            </aside>
          )}
          {['PHONE_IDLE', 'ENCOUNTER_INTRO', 'INVESTIGATION', 'DECISION', 'CONSEQUENCE', 'ENCOUNTER_COMPLETE'].includes(game.state.phase) && (
            <EvidenceTray game={game} openApp={openApp} />
          )}
          {game.state.phase === 'INVESTIGATION' && (
            <>
              <InvestigationHints game={game} />
              <PendingDecisionChip game={game} />
            </>
          )}
          {!isEventMode && game.state.phase === 'DECISION' && (
            <>
              <DecisionSheet key={game.pendingDecision?.id ?? 'none'} game={game} />
              <InvestigationHints game={game} />
            </>
          )}
          {game.state.phase === 'CONSEQUENCE' && game.lastDecision && (
            <FeedbackCard game={game} onContinue={continueToNextAttack} />
          )}
          {game.state.phase === 'RESULTS' && (
            <ResultsScreen game={game} onPlayAgain={playAgain} playAgainLabel={isEventMode ? 'Return to session' : 'Play again'} />
          )}
          <NotificationManager
            // A "Decision ready" notification disappears once that decision is no longer pending.
            notifications={notifications.filter(n => !n.decisionId || n.decisionId === game.pendingDecision?.id)}
            onOpen={openNotification}
            onDismiss={dismissNotification}
          />
        </PhoneShell>
      )}
      {isDev && !isEventMode && (
        <DeveloperPanel
          selectedStage={horror.stage}
          setStage={horror.setStage}
          triggerNotification={triggerNotification}
          triggerCall={() => setIncomingCall(true)}
          triggerGlitch={horror.triggerGlitch}
          reset={reset}
        />
      )}
      {isDev && !isEventMode && <EnginePanel game={game} />}
    </div>
  )
}

function AppRoot() {
  if (window.location.pathname === '/admin') return <OrganizerDashboard />
  return <App />
}

export default AppRoot
