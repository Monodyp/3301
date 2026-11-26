import type { Game } from '../../game/useGame'
import type { PhoneSurface, ScenarioPhoneInteraction } from '../../game/scenarioRegistry'
import type { Artifact } from '../../game/types'

export type TrustedSearchOutcome =
  | { kind: 'miss'; title: string; detail: string }
  | { kind: 'listing'; title: string; url: string; detail: string }
  | { kind: 'unlisted'; title: string; source: string; detail: string }

export function trustedLocalSearch(
  query: string,
  expectedQuery: string | undefined,
  location: string,
  pages: readonly { title: string; url: string; body: string; suspicious?: boolean }[],
  artifacts: readonly Pick<Artifact, 'app' | 'label' | 'detail'>[],
): TrustedSearchOutcome {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!expectedQuery || !normalizedQuery.includes(expectedQuery.toLocaleLowerCase())) {
    return {
      kind: 'miss',
      title: 'No matching local result',
      detail: 'No results found.',
    }
  }

  const listing = pages.find(page =>
    !page.suspicious
    && `${page.title} ${page.url}`.toLocaleLowerCase().includes(normalizedQuery),
  )
  if (listing) {
    return { kind: 'listing', title: listing.title, url: listing.url, detail: listing.body }
  }

  const context = artifacts.find(artifact => artifact.app === 'browser')
    ?? artifacts.find(artifact => artifact.app === 'social')
  return {
    kind: 'unlisted',
    title: `No independent listing for “${expectedQuery}”`,
    source: `${location} public directory`,
    detail: context
      ? `${context.label}: ${context.detail}`
      : 'The offer has no independently verifiable local listing. No external address was opened.',
  }
}

export function availablePhoneInteractions(game: Game, surface: PhoneSurface): ScenarioPhoneInteraction[] {
  const entry = game.resolutionAction
  const scenarioId = game.encounter?.id
  if (
    game.state.runMode !== 'event'
    || game.state.phase !== 'INVESTIGATION'
    || !entry
    || !scenarioId
    || entry.scenarioId !== scenarioId
  ) return []

  const completed = game.state.performedPhoneInteractions[scenarioId] ?? []
  return entry.action.interactions.filter(interaction =>
    interaction.surface === surface
    && !completed.includes(interaction.id)
  )
}

export function primaryInteractionFor(game: Game, surface: PhoneSurface): ScenarioPhoneInteraction | undefined {
  const primaryId = game.resolutionAction?.action.primaryInteractionId
  return availablePhoneInteractions(game, surface).find(interaction => interaction.id === primaryId)
}

export function interactionsFor(
  game: Game,
  surface: PhoneSurface,
  ...controls: ScenarioPhoneInteraction['control'][]
): ScenarioPhoneInteraction[] {
  return availablePhoneInteractions(game, surface).filter(interaction => controls.includes(interaction.control))
}

export function performPhoneInteraction(
  game: Game,
  interaction: ScenarioPhoneInteraction,
  parameters?: Readonly<Record<string, string>>,
): void {
  const scenarioId = game.encounter?.id
  const entry = game.resolutionAction
  if (!scenarioId || !entry || entry.scenarioId !== scenarioId) return
  game.actions.performPhoneInteraction({
    scenarioId,
    interactionId: interaction.id,
    surface: interaction.surface,
    parameters,
  })
}
