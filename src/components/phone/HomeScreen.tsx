import {
  MessageCircle, Users, Mail, Globe2, ContactRound, Phone,
  WalletCards, Settings, Camera, Compass,
} from 'lucide-react'
import type { AppId } from '../../types'
import { AppIcon } from './AppIcon'

export function HomeScreen({ openApp, unread }: { openApp: (id: AppId) => void; unread: Record<AppId, number> }) {
  const apps = [
    { id: 'messages' as const, label: 'Messages', icon: MessageCircle, color: 'linear-gradient(145deg,#69b9ed,#4d86ca)' },
    { id: 'social' as const, label: 'Social', icon: Users, color: 'linear-gradient(145deg,#c8b2eb,#8f7eb3)' },
    { id: 'email' as const, label: 'Email', icon: Mail, color: 'linear-gradient(145deg,#e2a77f,#bd6f55)' },
    { id: 'browser' as const, label: 'Browser', icon: Globe2, color: 'linear-gradient(145deg,#75c6ad,#4b927f)' },
    { id: 'contacts' as const, label: 'Contacts', icon: ContactRound, color: 'linear-gradient(145deg,#8fa8cc,#58789f)' },
    { id: 'calls' as const, label: 'Calls', icon: Phone, color: 'linear-gradient(145deg,#72b78b,#4d8463)' },
    { id: 'wallet' as const, label: 'Wallet', icon: WalletCards, color: 'linear-gradient(145deg,#d1bd74,#98803f)' },
    { id: 'settings' as const, label: 'Settings', icon: Settings, color: 'linear-gradient(145deg,#9ba0a8,#656a72)' },
  ]

  return (
    <div className="home-screen">
      <div className="home-widgets">
        <div>
          <div className="weather">13°</div>
          <div className="location">Northbridge</div>
        </div>
        <div className="date-block"><span>MON</span><strong>24</strong></div>
      </div>
      <div className="app-grid">
        {apps.map(app => (
          <AppIcon key={app.id} icon={app.icon} label={app.label} color={app.color}
            badge={unread[app.id]} onClick={() => openApp(app.id)} />
        ))}
      </div>
      <div className="bottom-dock">
        <AppIcon icon={Phone} label="Calls" color="linear-gradient(145deg,#74b88a,#4d8060)" onClick={() => openApp('calls')} />
        <AppIcon icon={Compass} label="Browser" color="linear-gradient(145deg,#75c6ad,#4b927f)" onClick={() => openApp('browser')} />
        <AppIcon icon={MessageCircle} label="Messages" color="linear-gradient(145deg,#69b9ed,#4d86ca)" onClick={() => openApp('messages')} />
        <AppIcon icon={Camera} label="Camera" color="linear-gradient(145deg,#aaaeb4,#747980)" onClick={() => undefined} />
      </div>
    </div>
  )
}
