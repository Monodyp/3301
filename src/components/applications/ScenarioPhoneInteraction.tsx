import type { ReactNode } from 'react'
import type { Game } from '../../game/useGame'
import type { ScenarioPhoneInteraction as ScenarioPhoneInteractionType } from '../../game/scenarioRegistry'
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
  return (
    <button
      className={`native-phone-interaction native-interaction-${interaction.control} ${className}`.trim()}
      aria-pressed={pressed}
      role={role}
      onClick={() => {
        onClick?.()
        performPhoneInteraction(game, interaction, parameters)
      }}
    >
      {children ?? interaction.label}
    </button>
  )
}
