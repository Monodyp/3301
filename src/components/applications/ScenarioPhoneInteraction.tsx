import type { ReactNode } from 'react'
import type { Game } from '../../game/useGame'
import type { ScenarioPhoneInteraction as ScenarioPhoneInteractionType } from '../../game/scenarioRegistry'
import { PROTECTIVE_ACTION_CATALOG } from '../../game/scenarioRegistry'
import { performPhoneInteraction } from './phoneInteractionUtils'

export function ScenarioPhoneInteraction({
  game,
  interaction,
  className = '',
  children,
  role,
  onClick,
  pressed,
  parameters,
}: {
  game: Game
  interaction: ScenarioPhoneInteractionType
  className?: string
  children?: ReactNode
  role?: 'menuitem'
  onClick?: () => void
  pressed?: boolean
  parameters?: Readonly<Record<string, string>>
}) {
  if (!game.encounter?.id || !game.resolutionAction || game.resolutionAction.scenarioId !== game.encounter.id) return null
  const isPrimary = game.resolutionAction.action.primaryInteractionId === interaction.id
  const actionDetails = interaction.actionType
    ? PROTECTIVE_ACTION_CATALOG[interaction.actionType]
    : null
  const detail = interaction.classification === 'incorrect'
    ? 'Unsafe option · consequences apply, and the incident remains unresolved.'
    : isPrimary
      ? `Primary response · ${actionDetails?.description ?? 'This resolves the incident.'} Resolves this incident.`
      : actionDetails
        ? `Optional support · ${actionDetails.description} Does not resolve the incident by itself.`
        : 'Optional supporting action · does not resolve the incident by itself.'
  return (
    <button
      className={`native-phone-interaction native-interaction-${interaction.control} ${className}`.trim()}
      aria-pressed={pressed}
      aria-label={detail ? `${interaction.label}. ${detail}` : undefined}
      title={detail ?? undefined}
      role={role}
      onClick={() => {
        onClick?.()
        performPhoneInteraction(game, interaction, parameters)
      }}
    >
      {children ?? interaction.label}
      {detail && <small className="native-interaction-detail">{detail}</small>}
    </button>
  )
}
