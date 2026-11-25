import { ArrowLeft, RotateCw, Search } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { CharacterPhoneData } from '../../data/characterData'
import type { Character, Encounter, PhoneEvent } from '../../game/types'
import type { Game } from '../../game/useGame'
import { PHONE_TARGETS } from '../../game/narrative'
import { progressiveAdvertisement } from './progressiveAd'
import { usePassiveClueTarget } from '../investigation/PassiveClueTarget'
import { ReadMarker } from './ReadMarker'
import { ScenarioPhoneInteraction } from './ScenarioPhoneInteraction'
import { interactionsFor, trustedLocalSearch } from './phoneInteractionUtils'

export function BrowserApp({ game, data, encounter, character, completedEncounterIds = [], onPhoneEvent }: {
  game: Game
  data?: CharacterPhoneData
  encounter?: Encounter
  character?: Character
  completedEncounterIds?: readonly string[]
  onPhoneEvent?: (event: PhoneEvent) => void
}) {
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [searchedQuery, setSearchedQuery] = useState('')
  const [searchOutcome, setSearchOutcome] = useState<ReturnType<typeof trustedLocalSearch> | null>(null)
  const progressiveAd = progressiveAdvertisement(character, completedEncounterIds)
  const directoryPages = data?.browserPages ?? [
    { id: 'northbridge', title: 'Northbridge', url: 'northbridge.local', subtitle: 'Local network directory', body: 'Transit schedules, municipal records, and building maintenance notices.' },
  ]
  const pages = [
    ...(encounter?.trigger.app === 'browser' ? [{
      id: encounter.id,
      title: encounter.trigger.title,
      url: `${encounter.characterId}.incident.local`,
      subtitle: encounter.trigger.sender,
      body: encounter.trigger.message,
      suspicious: true,
    }] : []),
    ...directoryPages,
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
  const browserClueArtifacts = encounter?.artifacts.filter(artifact => artifact.app === 'browser') ?? []
  const contextArtifact = browserClueArtifacts[0]
    ?? encounter?.artifacts.find(artifact => artifact.app === 'social')
  const targetFor = (pageId: string) => encounter && pageId === encounter.id ? PHONE_TARGETS.incident(encounter.id) : PHONE_TARGETS.ambient('browser', pageId)
  const incidentClueRef = usePassiveClueTarget(game, 'browser', 'incident', Boolean(selected && encounter && selected.id === encounter.id))
  const appClueRef = usePassiveClueTarget(game, 'browser', 'app', Boolean(
    (selected && (!encounter || selected.id !== encounter.id))
    || (searchOutcome && searchOutcome.kind !== 'miss' && encounter?.artifacts.some(artifact => artifact.app === 'browser')),
  ))
  const searches = interactionsFor(game, 'browser', 'search')
  const links = interactionsFor(game, 'browser', 'link')
  const openPage = (page: { id: string; url: string }) => {
    setSelectedUrl(page.url)
    onPhoneEvent?.({ kind: 'CONVERSATION_OPENED', app: 'browser', target: targetFor(page.id) })
  }
  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const searchTerm = query.trim()
    const interaction = searches[0]
    if (!searchTerm) return
    setSearchedQuery(searchTerm)
    setSelectedUrl(null)
    setSearchOutcome(trustedLocalSearch(
      searchTerm,
      interaction?.expectedQuery,
      data?.profile.location ?? 'Northbridge',
      directoryPages,
      encounter?.artifacts ?? [],
    ))
  }
  return (
    <div className="app-content browser-app">
      <div className="browser-chrome">
        <button><ArrowLeft size={18} /></button>
        <form className="browser-address-form" onSubmit={submitSearch}>
          <Search size={14} />
          <input aria-label="Search or enter address" value={query} onChange={event => setQuery(event.target.value)} placeholder={selectedUrl ?? 'Search or enter address'} />
          {searches.length > 0 && <button type="submit" aria-label="Go to address">Go</button>}
        </form>
        <button><RotateCw size={16} /></button>
      </div>
      <div className="browser-page">
        {selected ? (
          <>
            <section ref={selected.id === encounter?.id ? incidentClueRef : appClueRef}>
            <div className="page-mark">{selected.title[0]}</div>
            <h1>{selected.title}</h1>
            <p className="page-subtitle">{selected.url}</p>
            <div className="search-result"><strong>{selected.subtitle}</strong><p>{selected.body}</p></div>
            {selected.suspicious && <button className="browser-warning">Suspicious local preview — no credentials collected</button>}
            <ReadMarker key={targetFor(selected.id)} onRead={() => onPhoneEvent?.({ kind: 'MESSAGE_READ', app: 'browser', target: targetFor(selected.id) })} />
            <button className="detail-back" onClick={() => setSelectedUrl(null)}><ArrowLeft size={16} /> Search results</button>
            </section>
            {links.map(interaction => <ScenarioPhoneInteraction key={interaction.id} game={game} interaction={interaction} className="browser-inline-link">Open link</ScenarioPhoneInteraction>)}
          </>
        ) : (
          <>
            {searchedQuery && searchOutcome && <section
              className="local-search-results"
              aria-live="polite"
              ref={searchOutcome.kind !== 'miss' ? appClueRef : undefined}
            >
              <span>Search results</span><strong>{searchedQuery}</strong>
              <p>{searchOutcome.kind === 'listing'
                ? <><b>{searchOutcome.title}</b> · {searchOutcome.url}<br />{searchOutcome.detail}</>
                : searchOutcome.kind === 'unlisted'
                  ? <><b>{searchOutcome.title}</b> · {searchOutcome.source}<br /><span data-clue-target={contextArtifact?.id}>{searchOutcome.detail}</span></>
                  : searchOutcome.detail}</p>
              {searchOutcome.kind !== 'miss' && browserClueArtifacts
                .filter(artifact => searchOutcome.kind !== 'unlisted' || artifact.id !== contextArtifact?.id)
                .map(artifact => (
                  <p className="directory-result-detail" key={artifact.id} data-clue-target={artifact.id}>
                    <b>{artifact.label}</b> · {artifact.detail}
                  </p>
                ))}
              {searchOutcome.kind !== 'miss' && searches[0] && (
                <ScenarioPhoneInteraction
                  game={game}
                  interaction={searches[0]}
                  parameters={{ query: searchedQuery }}
                  className="browser-inline-link"
                >
                  {searchOutcome.kind === 'listing' ? 'Open local listing' : 'Review directory result'}
                </ScenarioPhoneInteraction>
              )}
            </section>}
            <div className="page-mark">N</div>
            <h1>{data?.profile.location ?? 'Northbridge'}</h1>
            <p className="page-subtitle">Fictional local directory</p>
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
