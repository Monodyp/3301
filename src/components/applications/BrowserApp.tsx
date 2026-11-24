import { ArrowLeft, RotateCw, Search } from 'lucide-react'
import { useState } from 'react'
import type { CharacterPhoneData } from '../../data/characterData'
import type { Encounter } from '../../game/types'

export function BrowserApp({ data, encounter }: { data?: CharacterPhoneData; encounter?: Encounter }) {
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
  const pages = [
    ...(encounter?.trigger.app === 'browser' ? [{
      id: encounter.id,
      title: encounter.trigger.title,
      url: `${encounter.characterId}.incident.local`,
      subtitle: encounter.trigger.sender,
      body: encounter.trigger.message,
      suspicious: true,
    }] : []),
    ...(data?.browserPages ?? [
    { id: 'northbridge', title: 'Northbridge', url: 'northbridge.local', subtitle: 'Local network directory', body: 'Transit schedules, municipal records, and building maintenance notices.' },
  ]),
    ...(encounter?.advertisement ? [{
      id: encounter.advertisement.id,
      title: encounter.advertisement.title,
      url: encounter.advertisement.destination,
      subtitle: 'Sponsored preview',
      body: encounter.advertisement.description,
      suspicious: encounter.advertisement.suspicious,
    }] : []),
    ...(data?.advertisements ?? []).map(ad => ({
      id: ad.id,
      title: ad.title,
      url: ad.destination,
      subtitle: 'Sponsored preview',
      body: ad.description,
      suspicious: true,
    })),
  ]
  const selected = pages.find(page => page.url === selectedUrl)
  return (
    <div className="app-content browser-app">
      <div className="browser-chrome">
        <button><ArrowLeft size={18} /></button>
        <div className="address-bar"><Search size={14} /> {selectedUrl ?? 'northbridge.local'}</div>
        <button><RotateCw size={16} /></button>
      </div>
      <div className="browser-page">
        {selected ? (
          <>
            <div className="page-mark">{selected.title[0]}</div>
            <h1>{selected.title}</h1>
            <p className="page-subtitle">{selected.url}</p>
            <div className="search-result"><strong>{selected.subtitle}</strong><p>{selected.body}</p></div>
            {selected.suspicious && <button className="browser-warning">Suspicious local preview — no credentials collected</button>}
            <button className="detail-back" onClick={() => setSelectedUrl(null)}><ArrowLeft size={16} /> Search results</button>
          </>
        ) : (
          <>
            <div className="page-mark">N</div>
            <h1>{data?.profile.location ?? 'Northbridge'}</h1>
            <p className="page-subtitle">Fictional local directory</p>
            {pages.map(page => (
              <button className="search-result browser-result" key={page.id} onClick={() => setSelectedUrl(page.url)}>
                <span>{page.url}</span>
                <strong>{page.title}</strong>
                <p>{page.subtitle}</p>
              </button>
            ))}
            {(data?.advertisements ?? []).map(ad => (
              <button className="browser-ad" key={ad.id} onClick={() => setSelectedUrl(ad.destination)}>
                <span>Sponsored preview</span>
                <strong>{ad.title}</strong>
                <p>{ad.description}</p>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
