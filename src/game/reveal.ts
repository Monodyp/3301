// The Project Blackout directory shown after the eighth encounter
// (GDD Stage 1, section 10). Screens render this; they don't assemble it.
//
// The layout is the same for every player and every encounter order:
// fragments are listed in archetype order (A1 to O2), not the order they were
// played. Fragments the player didn't recover still show, as unrecovered,
// so the ending works whatever they found.

import type { Archetype, ClueGroup, GameState } from './types.ts'
import { ARCHETYPES } from './types.ts'
import { currentCharacter } from './engine.ts'

export const PROFILES_INDEXED = 25
export const ENCOUNTER_RECORDS = 200

export const CLUE_GROUP_LABEL: Record<ClueGroup, string> = {
  'PBI-01': 'Behavioral profiling',
  'PBI-02': 'Relationship mapping',
  'PBI-03': 'Vulnerability mapping',
  'PBI-04': 'Influence',
  'PBI-05': 'Campaign attribution',
}

export const UNRECOVERED_TEXT = '[FRAGMENT NOT RECOVERED]'

export interface RevealFragment {
  clueId: string
  archetype: Archetype
  group: ClueGroup
  groupLabel: string
  recovered: boolean
  text: string // the fragment, or UNRECOVERED_TEXT
}

export interface BlackoutReveal {
  operation: 'PROJECT BLACKOUT'
  campaignId: 'BC-07'
  profilesIndexed: number
  encounterRecords: number
  currentProfile: string // the character's name in capitals
  status: { label: string; value: string }[]
  campaignStatus: 'PROFILE COMPLETE'
  fragments: RevealFragment[]
  recoveredCount: number
  finalLines: string[]
  closingLine: 'CONNECTION TERMINATED.'
}

export function buildBlackoutReveal(state: GameState): BlackoutReveal | null {
  const character = currentCharacter(state)
  if (!character) return null

  const fragments: RevealFragment[] = ARCHETYPES.flatMap(archetype => {
    const encounter = character.encounters.find(e => e.archetype === archetype)
    if (!encounter) return []
    const recovered = state.blackoutClues.includes(encounter.clue.id)
    return [{
      clueId: encounter.clue.id,
      archetype,
      group: encounter.clue.group,
      groupLabel: CLUE_GROUP_LABEL[encounter.clue.group],
      recovered,
      text: recovered ? encounter.clue.fragment : UNRECOVERED_TEXT,
    }]
  })

  return {
    operation: 'PROJECT BLACKOUT',
    campaignId: 'BC-07',
    profilesIndexed: PROFILES_INDEXED,
    encounterRecords: ENCOUNTER_RECORDS,
    currentProfile: character.name.toUpperCase(),
    // The same for every character (canon: one ending structure for all 25).
    status: [
      { label: 'STATUS', value: 'OBSERVED' },
      { label: 'BEHAVIORAL INTERESTS', value: 'INDEXED' },
      { label: 'TRUST NETWORK', value: 'MAPPED' },
      { label: 'INFLUENCE PROFILE', value: 'GENERATED' },
    ],
    campaignStatus: 'PROFILE COMPLETE',
    fragments,
    recoveredCount: fragments.filter(f => f.recovered).length,
    finalLines: ['You thought you were investigating them.', 'You were investigating us.'],
    closingLine: 'CONNECTION TERMINATED.',
  }
}
