import { useState } from 'react'
import { ArrowLeft, MoreHorizontal } from 'lucide-react'
import type { CharacterPhoneData } from '../../data/characterData'
import type { ConversationData } from '../../data/characterData'
import type { Encounter, PhoneEvent } from '../../game/types'
import type { Game } from '../../game/useGame'
import { PHONE_TARGETS } from '../../game/narrative'
import { usePassiveClueTarget } from '../investigation/PassiveClueTarget'
import { ReadMarker } from './ReadMarker'
import { ScenarioPhoneInteraction } from './ScenarioPhoneInteraction'
import { interactionsFor, primaryInteractionFor } from './phoneInteractionUtils'

const INCIDENT = -1

// Reports CONVERSATION_OPENED when a conversation is opened and MESSAGE_READ
// when its last message scrolls into view. The engine decides whether either
// matters; ordinary conversations (like Mara's package chat) never do.
export function MessagesApp({ game, data, encounter, onPhoneEvent }: { game: Game; data?: CharacterPhoneData; encounter?: Encounter; onPhoneEvent?: (event: PhoneEvent) => void }) {
  const [selected, setSelected] = useState<number | null>(null)
  const [sentReplies, setSentReplies] = useState<Record<number, string[]>>({})
  const [sentIncidentReplies, setSentIncidentReplies] = useState<Record<string, string[]>>({})
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const conversationsData: ConversationData[] = data?.conversations ?? []
  const incident = encounter?.trigger.app === 'messages' ? encounter : undefined
  const supportingArtifacts = encounter?.trigger.app === 'messages'
    ? []
    : encounter?.artifacts.filter(artifact => artifact.app === 'messages') ?? []
  const selectedArtifact = supportingArtifacts.find(artifact => artifact.id === selectedArtifactId)
  // Some incidents continue an existing conversation (StarWatcher, Lance).
  const incidentConversation = incident ? conversationsData.find(item => item.name === incident.trigger.sender) : undefined
  const incidentClueIds = game.clues
    .filter(clue => clue.source.app === 'messages' && clue.source.surface === 'incident')
    .map(clue => clue.artifact.id)
  const isIncident = (id: number) => incident !== undefined && (id === INCIDENT || id === incidentConversation?.id)
  const targetFor = (id: number) => isIncident(id) && incident ? PHONE_TARGETS.incident(incident.id) : PHONE_TARGETS.ambient('messages', id)
  const open = (id: number) => {
    setSelected(id)
    onPhoneEvent?.({ kind: 'CONVERSATION_OPENED', app: 'messages', target: targetFor(id) })
  }
  const markRead = (id: number) => () => onPhoneEvent?.({ kind: 'MESSAGE_READ', app: 'messages', target: targetFor(id) })
  const incidentClueRef = usePassiveClueTarget(game, 'messages', 'incident', Boolean(selected !== null && incident && isIncident(selected)))
  const appClueRef = usePassiveClueTarget(game, 'messages', 'app', Boolean(
    (selected !== null && !isIncident(selected)) || selectedArtifact,
  ))
  const primaryMenuAction = primaryInteractionFor(game, 'messages')
  const inlinePrimaryMenuAction = primaryMenuAction?.control === 'menu-item' ? primaryMenuAction : undefined
  const menuItems = (selected !== null && incident && isIncident(selected)
    ? interactionsFor(game, 'messages', 'menu-item')
    : [])
    .filter(interaction => interaction.id !== inlinePrimaryMenuAction?.id)
  const replies = interactionsFor(game, 'messages', 'reply')
  const attachments = interactionsFor(game, 'messages', 'attachment')
  const preserve = interactionsFor(game, 'messages', 'preserve')
  const messageMenu = menuItems.length > 0 && (
    <div className="native-phone-menu" role="menu">
      {menuItems.map(interaction => <ScenarioPhoneInteraction key={interaction.id} game={game} interaction={interaction} role="menuitem">{interaction.label}</ScenarioPhoneInteraction>)}
    </div>
  )
  const renderReplyComposer = (onSend: (text: string) => void) => replies.length > 0 && (
    <div className="native-reply-options" aria-label="Message replies">
      {replies.map(interaction => {
        const text = interaction.label.replace(/^Send:\s*/, '')
        return (
          <div className="native-reply-option" key={interaction.id}>
            <span>{text}</span>
            <ScenarioPhoneInteraction game={game} interaction={interaction} onClick={() => onSend(text)}>Send</ScenarioPhoneInteraction>
          </div>
        )
      })}
    </div>
  )
  const attachmentCard = attachments.length > 0 && (
    <div className="native-attachment" aria-label="Conversation attachment">
      <div><strong>{game.encounter?.artifacts.find(item => item.app === 'messages')?.label ?? 'Shared file'}</strong><small>Attachment · stored on this device</small></div>
      {attachments.map(interaction => (
        <ScenarioPhoneInteraction key={interaction.id} game={game} interaction={interaction}>
          {/run|install|open|trust/i.test(interaction.label) ? 'Open' : 'Remove'}
        </ScenarioPhoneInteraction>
      ))}
    </div>
  )
  const saveConversation = preserve.map(interaction => (
    <ScenarioPhoneInteraction key={interaction.id} game={game} interaction={interaction} className="native-save-control">Save</ScenarioPhoneInteraction>
  ))

  if (selectedArtifact) {
    return (
      <div className="app-content chat-view">
        <div className="chat-header">
          <button onClick={() => setSelectedArtifactId(null)} aria-label="Back to conversations"><ArrowLeft size={20} /></button>
          <strong>{encounter?.trigger.sender ?? 'Conversation'}</strong>
        </div>
        <div className="chat-thread" ref={appClueRef}>
          <div className="chat-bubble them" data-clue-target={selectedArtifact.id}>
            <span>{selectedArtifact.detail}</span><time>Earlier</time>
          </div>
        </div>
      </div>
    )
  }

  if (selected !== null) {
    if (selected === INCIDENT && incident) return (
      <div className="app-content chat-view">
        <div className="chat-header"><button onClick={() => setSelected(null)} aria-label="Back to conversations"><ArrowLeft size={20} /></button><strong>{incident.trigger.sender}</strong>{menuItems.length > 0 && <button aria-label="Conversation options" onClick={() => setMenuOpen(value => !value)}><MoreHorizontal size={20} /></button>}{menuOpen && messageMenu}</div>
        <div className="chat-thread" ref={incidentClueRef}>
          <div className="chat-bubble them" data-clue-target={incidentClueIds[0]}>
            <span>{incident.trigger.message}</span><time>now</time>
          </div>
          {incident.thread.map((message, index) => <div
            key={index}
            className={`chat-bubble ${message.from}`}
            data-clue-target={incidentClueIds.length > 1 && index === incident.thread.length - 1 ? incidentClueIds[1] : undefined}
          ><span>{message.text}</span><time>{message.time}</time></div>)}
          {(sentIncidentReplies[incident.id] ?? []).map((reply, index) => <div key={`sent-${index}`} className="chat-bubble me"><span>{reply}</span><time>now</time></div>)}
          <ReadMarker key={targetFor(INCIDENT)} onRead={markRead(INCIDENT)} />
          {attachmentCard}
          {saveConversation}
          {inlinePrimaryMenuAction && (
            <section className="native-primary-action" aria-label="Primary protective action">
              <span>Primary response</span>
              <ScenarioPhoneInteraction game={game} interaction={inlinePrimaryMenuAction} />
            </section>
          )}
          {renderReplyComposer(text => setSentIncidentReplies(current => ({ ...current, [incident.id]: [...(current[incident.id] ?? []), text] })))}
        </div>
      </div>
    )
    const conversation = conversationsData.find(item => item.id === selected) ?? conversationsData[0]
    if (!conversation) return null
    const extraReplies = sentReplies[conversation.id] ?? []
    const thread = isIncident(conversation.id) && incident ? incident.thread : []
    return (
      <div className="app-content chat-view">
        <div className="chat-header">
          <button onClick={() => setSelected(null)} aria-label="Back to conversations"><ArrowLeft size={20} /></button>
          <div className="avatar" style={{ background: conversation.color }}>{conversation.name[0]}</div>
          <strong>{conversation.name}</strong>
          {menuItems.length > 0 && <button aria-label="Conversation options" onClick={() => setMenuOpen(value => !value)}><MoreHorizontal size={20} /></button>}
          {menuOpen && messageMenu}
        </div>
        <div className="chat-thread" ref={isIncident(conversation.id) ? incidentClueRef : appClueRef}>
          {isIncident(conversation.id) && incident && (
            <div className="chat-bubble them" data-clue-target={incidentClueIds[0]}>
              <span>{incident.trigger.message}</span><time>now</time>
            </div>
          )}
          {[...thread, ...conversation.messages].map((message, index) => (
            <div
              key={index}
              className={`chat-bubble ${message.from}`}
              data-clue-target={isIncident(conversation.id)
                && incidentClueIds.length > 1
                && index === [...thread, ...conversation.messages].length - 1
                ? incidentClueIds[1]
                : undefined}
            >
              <span>{message.text}</span><time>{message.time}</time>
            </div>
          ))}
          <ReadMarker key={targetFor(conversation.id)} onRead={markRead(conversation.id)} />
          {extraReplies.map((reply, index) => (
            <div key={`reply-${index}`} className="chat-bubble me"><span>{reply}</span><time>now</time></div>
          ))}
          {attachmentCard}
          {saveConversation}
        </div>
        <div className="canned-replies" aria-label="Canned replies">
          {(replies.length > 0 ? [] : conversation.cannedReplies ?? ['I am going to verify this first.', 'I will not share private information.']).map(reply => (
            <button key={reply} onClick={() => setSentReplies(current => ({
              ...current,
              [conversation.id]: [...(current[conversation.id] ?? []), reply],
            }))}>{reply}</button>
          ))}
          {renderReplyComposer(text => setSentReplies(current => ({
            ...current,
            [conversation.id]: [...(current[conversation.id] ?? []), text],
          })))}
        </div>
      </div>
    )
  }
  return (
    <div className="app-content">
      <div className="app-title-row"><h2>Messages</h2><button>Edit</button></div>
      <div className="search-field">Search</div>
      <div className="conversation-list">
        {incident && !incidentConversation && <button className="conversation encounter-message" onClick={() => open(INCIDENT)}><div className="avatar">!</div><div className="conversation-copy"><strong>{incident.trigger.sender}</strong><span>{incident.trigger.message}</span></div><div className="conversation-meta"><time>now</time><b>1</b></div></button>}
        {supportingArtifacts.map(artifact => (
          <button
            key={artifact.id}
            className="conversation encounter-message"
            onClick={() => setSelectedArtifactId(artifact.id)}
          >
            <div className="avatar">!</div>
            <div className="conversation-copy"><strong>{encounter?.trigger.sender}</strong><span>{artifact.label}</span></div>
            <div className="conversation-meta"><time>Earlier</time></div>
          </button>
        ))}
        {conversationsData.map(item => (
          <button key={item.id} className={`conversation ${isIncident(item.id) ? 'encounter-message' : ''}`} onClick={() => open(item.id)}>
            <div className="avatar" style={{ background: item.color }}>{item.name[0]}</div>
            <div className="conversation-copy"><strong>{item.name}</strong><span>{isIncident(item.id) && incident ? incident.trigger.message : item.preview}</span></div>
            <div className="conversation-meta"><time>{isIncident(item.id) ? 'now' : item.time}</time>{(isIncident(item.id) || item.unread > 0) && <b>{isIncident(item.id) ? 1 : item.unread}</b>}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
