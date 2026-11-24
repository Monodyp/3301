import { ArrowLeft, RotateCw, Search } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { CharacterPhoneData } from '../../data/characterData'
import type { Character, Encounter, PhoneEvent } from '../../game/types'
import { PHONE_TARGETS } from '../../game/narrative'
import { progressiveAdvertisement } from './progressiveAd'
import { ReadMarker } from './ReadMarker'

export function BrowserApp({ data, encounter, character, completedEncounterIds = [], onPhoneEvent, clues }: {
  data?: CharacterPhoneData
  encounter?: Encounter
  character?: Character
  completedEncounterIds?: readonly string[]
  onPhoneEvent?: (event: PhoneEvent) => void
  clues?: (surface: 'incident' | 'app') => ReactNode
}) {
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
  const progressiveAd = progressiveAdvertisement(character, completedEncounterIds)
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
    ...(progressiveAd ? [{
      id: progressiveAd.id,
      title: progressiveAd.title,
      url: progressiveAd.destination,
      subtitle: 'Sponsored preview',
      body: progressiveAd.description,
      suspicious: progressiveAd.suspicious,
    }] : []),
    ...(data?.advertisements ?? []).map(ad => ({
      id: ad.id,
      title: ad.title,
      url: ad.destination,
      subtitle: 'Sponsored preview',
      body: ad.description,
      suspicious: false,
    })),
  ]
  const selected = pages.find(page => page.url === selectedUrl)
  const targetFor = (pageId: string) => encounter && pageId === encounter.id ? PHONE_TARGETS.incident(encounter.id) : PHONE_TARGETS.ambient('browser', pageId)
  const openPage = (page: { id: string; url: string }) => {
    setSelectedUrl(page.url)
    onPhoneEvent?.({ kind: 'CONVERSATION_OPENED', app: 'browser', target: targetFor(page.id) })
  }
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
            <ReadMarker key={targetFor(selected.id)} onRead={() => onPhoneEvent?.({ kind: 'MESSAGE_READ', app: 'browser', target: targetFor(selected.id) })} />
            {encounter && selected.id === encounter.id && clues?.('incident')}
            <button className="detail-back" onClick={() => setSelectedUrl(null)}><ArrowLeft size={16} /> Search results</button>
          </>
        ) : (
          <>
            <div className="page-mark">N</div>
            <h1>{data?.profile.location ?? 'Northbridge'}</h1>
            <p className="page-subtitle">Fictional local directory</p>
            {clues?.('app')}
            {pages.filter(page => page.id !== progressiveAd?.id).map(page => (
              <button className="search-result browser-result" key={page.id} onClick={() => openPage(page)}>
                <span>{page.url}</span>
                <strong>{page.title}</strong>
                <p>{page.subtitle}</p>
              </button>
            ))}
            {progressiveAd && (
              <button
                className={`browser-ad ${progressiveAd.tone === 'unsettling' ? 'browser-ad-unsettling' : ''}`}
                onClick={() => setSelectedUrl(progressiveAd.destination)}
              >
                <span>Sponsored preview</span>
                <strong>{progressiveAd.title}</strong>
                <p>{progressiveAd.description}</p>
              </button>
            )}
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
