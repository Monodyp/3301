import { BatteryMedium, HardDrive, Info, Wifi, Moon } from 'lucide-react'

export function SettingsApp() {
  return (
    <div className="app-content settings-app">
      <h2>Settings</h2>
      <div className="settings-profile"><div className="avatar">A</div><div><strong>Avery</strong><span>Northbridge</span></div></div>
      <div className="settings-group">
        <button><Wifi size={18} /><span>Wi-Fi</span><b>Northbridge</b></button>
        <button><Moon size={18} /><span>Appearance</span><b>Dark</b></button>
      </div>
      <div className="settings-group">
        <button><BatteryMedium size={18} /><span>Battery</span><b>72%</b></button>
        <button><HardDrive size={18} /><span>Storage</span><b>38.2 GB</b></button>
        <button><Info size={18} /><span>About</span><b>3301 OS</b></button>
      </div>
    </div>
  )
}
