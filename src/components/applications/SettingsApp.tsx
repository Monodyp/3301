import { BatteryMedium, HardDrive, Info, Wifi, Moon } from 'lucide-react'
import type { CharacterPhoneData } from '../../data/characterData'
import type { Hint } from '../../game/types'

export function SettingsApp({ data, accountSecurity, hints = [], completedTasks = [], onCompleteTask }: {
  data?: CharacterPhoneData
  accountSecurity?: number
  hints?: Hint[]
  completedTasks?: string[]
  onCompleteTask?: (taskId: string) => void
}) {
  const settings = data?.settings
  const securityStatus = accountSecurity !== undefined
    ? accountSecurity >= 80 ? 'Secure' : accountSecurity >= 50 ? 'Review needed' : 'Compromised'
    : settings?.securityStatus ?? 'Secure'
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
        <div><strong>Security Center</strong><b className={`security-${securityStatus.toLowerCase().replace(' ', '-')}`}>{securityStatus}</b></div>
        <p>{accountSecurity !== undefined ? `Simulated account security: ${accountSecurity}/100` : 'This character uses the shared run security status.'}</p>
        {hints.length > 0 ? <p className="security-hint">Kuya Ben: {hints[hints.length - 1].text}</p> : <p className="security-hint">Kuya Ben is available if this investigation becomes difficult.</p>}
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
