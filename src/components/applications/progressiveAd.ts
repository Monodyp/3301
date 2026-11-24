import type { Character } from '../../game/types'

export type ProgressiveAdTone = 'ordinary' | 'relevant' | 'unsettling'

export interface ProgressiveAdvertisement {
  id: string
  title: string
  description: string
  destination: string
  suspicious: boolean
  tone: ProgressiveAdTone
}

export function progressiveAdvertisement(
  character: Character | undefined,
  completedEncounterIds: readonly string[],
): ProgressiveAdvertisement | undefined {
  if (!character) return undefined

  const completed = completedEncounterIds.flatMap(id => {
    const encounter = character.encounters.find(item => item.id === id)
    return encounter ? [encounter] : []
  })
  const latest = completed[completed.length - 1]
  const role = character.occupation.toLowerCase()

  if (completed.length < 2 || !latest) {
    return {
      id: `recommendation-${character.id}-ordinary`,
      title: 'Tools for your next project',
      description: `A simple planning kit for a ${role}.`,
      destination: `sponsored.example/${character.id}/starter`,
      suspicious: false,
      tone: 'ordinary',
    }
  }

  if (completed.length < 5) {
    return {
      id: `recommendation-${character.id}-${latest.id}-relevant`,
      title: `A guide to ${latest.title}`,
      description: `Sponsored advice about ${latest.title}: ${latest.lesson.toLowerCase()} for a ${role}.`,
      destination: `sponsored.example/${character.id}/guides/${latest.id.toLowerCase()}`,
      suspicious: false,
      tone: 'relevant',
    }
  }

  return {
    id: `recommendation-${character.id}-${latest.id}-unsettling`,
    title: `Still thinking about ${latest.title}?`,
    description: `Suggested after your recent phone activity about “${latest.title}”. A guide for a ${role}.`,
    destination: `sponsored.example/${character.id}/follow-up/${latest.id.toLowerCase()}`,
    suspicious: true,
    tone: 'unsettling',
  }
}
