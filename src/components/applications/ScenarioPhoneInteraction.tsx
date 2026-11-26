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
  const action = interaction.actionType ? PROTECTIVE_ACTION_CATALOG[interaction.actionType] : null
  const accessibleLabel = children === undefined ? action?.title ?? interaction.label : undefined
  return (
    <button
      className={`native-phone-interaction native-interaction-${interaction.control} ${className}`.trim()}
      aria-pressed={pressed}
      aria-label={accessibleLabel}
      role={role}
      onClick={() => {
        onClick?.()
        performPhoneInteraction(game, interaction, parameters)
      }}
    >
      {children ?? action?.title ?? interaction.label}
    </button>
  )
}
