import { useState } from 'react'
import { ArrowLeft, MoreHorizontal } from 'lucide-react'
import type { CharacterPhoneData } from '../../data/characterData'
import type { Encounter, PhoneEvent } from '../../game/types'
import type { Game } from '../../game/useGame'
import { PHONE_TARGETS } from '../../game/narrative'
import { usePassiveClueTarget } from '../investigation/PassiveClueTarget'
import { ReadMarker } from './ReadMarker'
import { ScenarioPhoneInteraction } from './ScenarioPhoneInteraction'
import { interactionsFor, primaryInteractionFor } from './phoneInteractionUtils'

const INCIDENT = -1

export function EmailApp({ game, data, encounter, onPhoneEvent }: { game: Game; data?: CharacterPhoneData; encounter?: Encounter; onPhoneEvent?: (event: PhoneEvent) => void }) {
  const [selected, setSelected] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [sentReplies, setSentReplies] = useState<Record<string, string[]>>({})
  const emailData = data?.emails ?? []
  const supportingEmail = encounter
    && encounter.trigger.app !== 'email'
    && encounter.artifacts.some(artifact => artifact.app === 'email')
    ? encounter
    : undefined
  const supportingEmailArtifacts = supportingEmail?.artifacts.filter(artifact => artifact.app === 'email') ?? []
  const incident = encounter?.trigger.app === 'email' ? encounter : supportingEmail
  const incidentDeleted = Boolean(incident && game.state.performedPhoneInteractions[incident.id]?.some(id =>
    game.resolutionAction?.action.interactions.some(interaction => interaction.id === id && interaction.actionType === 'deleteEmail'),
  ))
  const incidentClueIds = game.clues
    .filter(clue => clue.source.app === 'email'
      && clue.source.surface === (incident?.trigger.app === 'email' ? 'incident' : 'app'))
    .map(clue => clue.artifact.id)
  const scenarioCompose = Boolean(encounter && encounter.trigger.app !== 'email' && interactionsFor(game, 'email', 'reply').length > 0)
  const targetFor = (index: number) => index === INCIDENT && incident ? PHONE_TARGETS.incident(incident.id) : PHONE_TARGETS.ambient('email', emailData[index]?.id ?? index)
  const open = (index: number) => {
    setSelected(index)
    onPhoneEvent?.({ kind: 'CONVERSATION_OPENED', app: 'email', target: targetFor(index) })
  }
  const markRead = (index: number) => () => onPhoneEvent?.({ kind: 'MESSAGE_READ', app: 'email', target: targetFor(index) })
  const incidentClueRef = usePassiveClueTarget(game, 'email', 'incident', selected === INCIDENT && incident?.trigger.app === 'email')
  const appClueRef = usePassiveClueTarget(game, 'email', 'app', Boolean(
    (selected !== null && selected !== INCIDENT)
    || (selected === INCIDENT && incident?.trigger.app !== 'email'),
  ))
  const primaryMenuAction = primaryInteractionFor(game, 'email')
  const inlinePrimaryMenuAction = primaryMenuAction?.control === 'menu-item' ? primaryMenuAction : undefined
  const menuItems = (selected === INCIDENT
    ? interactionsFor(game, 'email', 'menu-item')
    : [])
    .filter(interaction => interaction.id !== inlinePrimaryMenuAction?.id)
  const replies = interactionsFor(game, 'email', 'reply')
  const attachments = interactionsFor(game, 'email', 'attachment')
  const links = interactionsFor(game, 'email', 'link')
  const archives = interactionsFor(game, 'email', 'preserve')
  const menu = menuItems.length > 0 && (
    <div className="native-phone-menu" role="menu">
      {menuItems.map(interaction => (
        <ScenarioPhoneInteraction
          key={interaction.id}
          game={game}
          interaction={interaction}
          role="menuitem"
          onClick={interaction.actionType === 'deleteEmail' ? () => {
            setSelected(null)
            setMenuOpen(false)
          } : undefined}
        >
          {interaction.label}
        </ScenarioPhoneInteraction>
      ))}
    </div>
  )
  const renderReplyComposer = (key: string) => replies.length > 0 && (
    <div className="native-reply-options email-reply-options" aria-label="Email replies">
      {replies.map(interaction => (
        <div className="native-reply-option" key={interaction.id}>
          <span>{interaction.label.replace(/^Send:\s*/, '')}</span>
          <ScenarioPhoneInteraction game={game} interaction={interaction} onClick={() => setSentReplies(current => ({
            ...current,
            [key]: [...(current[key] ?? []), interaction.label.replace(/^Send:\s*/, '')],
          }))}>Send</ScenarioPhoneInteraction>
        </div>
      ))}
    </div>
  )
  const attachmentCard = attachments.length > 0 && (
    <div className="native-attachment email-attachment" aria-label="Email attachment">
      <div><strong>{game.encounter?.artifacts.find(item => item.app === 'email')?.label ?? 'Attached document'}</strong><small>Attachment · preview only</small></div>
      {attachments.map(interaction => <ScenarioPhoneInteraction key={interaction.id} game={game} interaction={interaction}>{/open|accept|upload/i.test(interaction.label) ? 'Open' : 'Remove'}</ScenarioPhoneInteraction>)}
    </div>
  )
  const archive = archives.map(interaction => <ScenarioPhoneInteraction key={interaction.id} game={game} interaction={interaction} className="native-save-control">Archive</ScenarioPhoneInteraction>)
  const safeLinks = links.map(interaction => <ScenarioPhoneInteraction key={interaction.id} game={game} interaction={interaction} className="native-email-link">Open link</ScenarioPhoneInteraction>)
  const composeRecipient = replies.some(interaction => /coordinator/i.test(interaction.label))
    ? 'Lab coordinator'
    : encounter?.trigger.sender ?? 'Recipient'

  if (selected !== null) {
    if (selected === INCIDENT && incident) {
      return (
        <div className="app-content email-detail">
          <div className="email-toolbar"><button className="detail-back" onClick={() => setSelected(null)}><ArrowLeft size={18} /> Inbox</button>{menuItems.length > 0 && <button aria-label="Message options" onClick={() => setMenuOpen(value => !value)}><MoreHorizontal size={20} /></button>}{menuOpen && menu}</div>
          <h2>{incident.trigger.app === 'email' ? incident.trigger.title : supportingEmailArtifacts[0]?.label ?? incident.trigger.title}</h2>
          <div className="email-sender"><div className="avatar">!</div><div><strong>{incident.trigger.sender}</strong><span>to me</span></div><time>now</time></div>
          <div ref={incident.trigger.app === 'email' ? incidentClueRef : appClueRef}>
            <p data-clue-target={incidentClueIds[0]}>
              {incident.trigger.app === 'email' ? incident.trigger.message : supportingEmailArtifacts[0]?.detail ?? incident.trigger.message}
            </p>
            {incident.trigger.app !== 'email' && supportingEmailArtifacts.slice(1).map((artifact, index) => (
              <p key={artifact.id} data-clue-target={incidentClueIds[index + 1]}>{artifact.detail}</p>
            ))}
          {incident.trigger.app === 'email' && incident.thread.length > 0 && (
            <div className="email-thread" aria-label="Messages in this thread">
              {incident.thread.map((message, index) => (
                <div
                  key={index}
                  className={`email-thread-item ${message.from}`}
                  data-clue-target={incidentClueIds.length > 1 && index === incident.thread.length - 1
                    ? incidentClueIds[1]
                    : undefined}
                >
                  <strong>{message.from === 'me' ? data?.profile.name ?? 'Me' : message.sender ?? 'Notice'}</strong>
                  <p>{message.text}</p>
                  {message.time && <time>{message.time}</time>}
                </div>
              ))}
            </div>
          )}
          </div>
          {(sentReplies[incident.id] ?? []).map((reply, index) => <div key={`sent-${index}`} className="email-thread-item me"><strong>{data?.profile.name ?? 'Me'}</strong><p>{reply}</p><time>now</time></div>)}
          {attachmentCard}
          {safeLinks}
          {inlinePrimaryMenuAction && (
            <section className="native-primary-action" aria-label="Primary protective action">
              <span>Primary response</span>
              <ScenarioPhoneInteraction game={game} interaction={inlinePrimaryMenuAction} />
            </section>
          )}
          <ReadMarker key={targetFor(INCIDENT)} onRead={markRead(INCIDENT)} />
          {archive}
          {renderReplyComposer(incident.id)}
        </div>
      )
    }
    const email = emailData[selected]
    if (!email) return null
    return (
      <div className="app-content email-detail">
        <div className="email-toolbar"><button className="detail-back" onClick={() => setSelected(null)}><ArrowLeft size={18} /> Inbox</button>{menuItems.length > 0 && <button aria-label="Message options" onClick={() => setMenuOpen(value => !value)}><MoreHorizontal size={20} /></button>}{menuOpen && menu}</div>
        <h2>{email.subject}</h2>
        <div className="email-sender"><div className="avatar">{email.sender[0]}</div><div><strong>{email.sender}</strong><span>to me</span></div><time>{email.time}</time></div>
        <div ref={appClueRef}>
          <p>{email.body ?? email.preview}</p>
        </div>
        {(sentReplies[email.id] ?? []).map((reply, index) => <div key={`sent-${index}`} className="email-thread-item me"><strong>{data?.profile.name ?? 'Me'}</strong><p>{reply}</p><time>now</time></div>)}
        {attachmentCard}
        {safeLinks}
        <ReadMarker key={targetFor(selected)} onRead={markRead(selected)} />
        {archive}
        {renderReplyComposer(String(email.id))}
      </div>
    )
  }
  return (
    <div className="app-content">
      <div className="app-title-row"><h2>Inbox</h2><button onClick={() => setComposeOpen(value => !value)}>Compose</button></div>
      {scenarioCompose && composeOpen && (
        <section className="email-compose-panel">
          <div><span>To</span><strong>{composeRecipient}</strong></div>
          <div><span>Subject</span><strong>{encounter?.title ?? 'Follow-up'}</strong></div>
          {renderReplyComposer(`compose-${encounter?.id ?? 'incident'}`)}
        </section>
      )}
      <div className="email-list">
        {incident && !incidentDeleted && (
          <button className="email-row encounter-email" onClick={() => open(INCIDENT)}>
            <i />
            <div><strong>{supportingEmailArtifacts[0]?.label ?? incident.trigger.sender}</strong><time>now</time></div>
            <b>{incident.trigger.app === 'email' ? incident.trigger.title : supportingEmailArtifacts[0]?.label ?? incident.trigger.title}</b>
            <span>{incident.trigger.app === 'email' ? incident.trigger.message : supportingEmailArtifacts[0]?.detail ?? incident.trigger.message}</span>
          </button>
        )}
        {emailData.map((email, index) => (
          <button className="email-row" key={email.id} onClick={() => open(index)}>
            {email.unread && <i />}
            <div><strong>{email.sender}</strong><time>{email.time}</time></div>
            <b>{email.subject}</b>
            <span>{email.preview}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
