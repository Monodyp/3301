import { ArrowLeft, RotateCw, Search } from 'lucide-react'

export function BrowserApp() {
  return (
    <div className="app-content browser-app">
      <div className="browser-chrome">
        <button><ArrowLeft size={18} /></button>
        <div className="address-bar"><Search size={14} /> northbridge.local</div>
        <button><RotateCw size={16} /></button>
      </div>
      <div className="browser-page">
        <div className="page-mark">N</div>
        <h1>Northbridge</h1>
        <p className="page-subtitle">Local network directory</p>
        <div className="search-result">
          <span>northbridge.local / services</span>
          <strong>Public service directory</strong>
          <p>Transit schedules, municipal records, and building maintenance notices.</p>
        </div>
        <div className="search-result">
          <span>northbridge.local / observatory</span>
          <strong>Hawthorne Observatory Archive</strong>
          <p>Digitized visitor logs and telescope operation records.</p>
        </div>
      </div>
    </div>
  )
}
