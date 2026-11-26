import { useState } from 'react'
import { BatteryMedium, HardDrive, Info, Wifi, Moon, ShieldAlert } from 'lucide-react'
import type { CharacterPhoneData } from '../../data/characterData'
import type { Hint } from '../../game/types'
import type { AttackEvent } from '../../game/attacks'
import type { Game } from '../../game/useGame'
import { usePassiveClueTarget } from '../investigation/PassiveClueTarget'
import { ScenarioPhoneInteraction } from './ScenarioPhoneInteraction'
import { interactionsFor } from './phoneInteractionUtils'

export function SettingsApp({ game, data, accountSecurity, hints = [], completedTasks = [], onCompleteTask, securityAlerts = [] }: {
  game: Game
  data?: CharacterPhoneData
  accountSecurity?: number
  hints?: Hint[]
  completedTasks?: string[]
  onCompleteTask?: (taskId: string) => void
  securityAlerts?: readonly AttackEvent[]
}) {
  const [securityOpen, setSecurityOpen] = useState(false)
  const settings = data?.settings
  const securityStatus = accountSecurity !== undefined
    ? accountSecurity >= 80 ? 'Secure' : accountSecurity >= 50 ? 'Review needed' : 'Compromised'
    : settings?.securityStatus ?? 'Secure'
  const securityArtifact = game.encounter?.artifacts.find(artifact => artifact.app === 'settings')
  const clueRef = usePassiveClueTarget(game, 'settings', 'app', securityOpen)
  const accountActions = interactionsFor(game, 'settings', 'menu-item')
  const protectionActions = interactionsFor(game, 'settings', 'security-toggle')
  return (
    <div className="app-content settings-app">
      <h2>Settings</h2>
      <div className="settings-profile"><div className="avatar" style={{ background: data?.profile.color }}>{data?.profile.name[0] ?? 'A'}</div><div><strong>{data?.profile.name ?? 'Avery'}</strong><span>{data?.profile.location ?? 'Northbridge'}</span></div></div>
      <div className="settings-group">
        <button><Wifi size={18} /><span>Wi-Fi</span><b>{settings?.wifi ?? 'Northbridge'}</b></button>
        <button><Moon size={18} /><span>Appearance</span><b>{settings?.appearance ?? 'Dark'}</b></button>
      </div>
      <div className="settings-group">
        <button><BatteryMedium size={18} /><span>Battery</span><b>{settings?.battery ?? 72}%</b></button>
        <button><HardDrive size={18} /><span>Storage</span><b>{settings?.storage ?? '38.2 GB'}</b></button>
        <button><Info size={18} /><span>About</span><b>3301 OS</b></button>
      </div>
      <div className="security-center">
        <button className="security-center-toggle" aria-expanded={securityOpen} onClick={() => setSecurityOpen(value => !value)}>
          <strong>Security Center</strong><b className={`security-${securityStatus.toLowerCase().replace(' ', '-')}`}>{securityStatus}</b>
        </button>
        {!securityOpen && (accountActions.length > 0 || protectionActions.length > 0) && (
          <p className="security-center-hint">This incident has a related device check in Security Center.</p>
        )}
        {securityOpen && (
          <div ref={clueRef}>
            <p>{accountSecurity !== undefined ? `Simulated account security: ${accountSecurity}/100` : 'This character uses the shared run security status.'}</p>
            {securityArtifact && <p className="security-activity" data-clue-target={securityArtifact.id}>{securityArtifact.detail}</p>}
            {hints.length > 0 ? <p className="security-hint">Kuya Ben: {hints[hints.length - 1].text}</p> : <p className="security-hint">Kuya Ben is available if this investigation becomes difficult.</p>}
            {securityAlerts.length > 0 && (
              <div className="security-alerts" aria-label="Security alerts">
                <strong>Security alerts</strong>
                {[...securityAlerts].reverse().map(alert => (
                  <div key={alert.id} className={`security-alert attack-tier-${alert.tier}`}>
                    <ShieldAlert size={14} />
                    <span>
                      <b>{alert.tierLabel} · Attack {alert.ordinal} · {alert.resolved ? 'Resolved' : 'Under investigation'}</b>
                      <small><strong>{alert.title}</strong> {alert.message}</small>
                      <em>{alert.detail}</em>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {accountActions.map(interaction => <ScenarioPhoneInteraction key={interaction.id} game={game} interaction={interaction} className="settings-native-action">{interaction.label}</ScenarioPhoneInteraction>)}
            {protectionActions.filter(interaction => interaction.classification === 'correct').map(interaction => (
              <ScenarioPhoneInteraction
                key={interaction.id}
                game={game}
                interaction={interaction}
                className="settings-protection-toggle"
                pressed={interaction.actionType === 'rejectInstallation' ? undefined : true}
              >
                <ShieldAlert size={18} /><span>{interaction.label}</span>
                {interaction.actionType !== 'rejectInstallation' && <b>On</b>}
              </ScenarioPhoneInteraction>
            ))}
            {protectionActions.filter(interaction => interaction.classification === 'incorrect').map(interaction => (
              <ScenarioPhoneInteraction key={interaction.id} game={game} interaction={interaction} className="settings-native-action">Turn off device protection</ScenarioPhoneInteraction>
            ))}
          </div>
        )}
      </div>
      <div className="security-tasks">
        <strong>Optional security tasks</strong>
        {[
          { id: 'verify-sender', title: 'Verify a sender', detail: 'Check identity through a second channel.' },
          { id: 'protect-login', title: 'Protect a login', detail: 'Never send a password or verification code.' },
          { id: 'check-link', title: 'Check a link', detail: 'Preview the fictional destination before opening.' },
        ].map(task => {
          const done = completedTasks.includes(task.id)
          return (
            <button key={task.id} disabled={done} onClick={() => onCompleteTask?.(task.id)}>
              <span><strong>{task.title}</strong><small>{task.detail}</small></span>
              <b>{done ? 'Completed' : 'Complete'}</b>
            </button>
          )
        })}
      </div>
    </div>
  )
}
