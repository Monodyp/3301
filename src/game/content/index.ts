// Every playable character. Add each new character file here.
// validateContent() checks the rules the engine relies on, so a broken
// character file fails loudly in tests and in dev mode instead of mid-run.

import type { Character, Encounter } from '../types.ts'
import { ARCHETYPES, CATEGORY_OF } from '../types.ts'
import { mika } from './mika.ts'
import { rafa } from './rafa.ts'

export const CHARACTERS: readonly Character[] = [mika, rafa]

export function getCharacter(id: string | null): Character | undefined {
  return CHARACTERS.find(c => c.id === id)
}

export function getEncounter(id: string | null): Encounter | undefined {
  if (!id) return undefined
  for (const c of CHARACTERS) {
    const found = c.encounters.find(e => e.id === id)
    if (found) return found
  }
  return undefined
}

export function validateContent(characters: readonly Character[] = CHARACTERS): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  const note = (id: string, where: string) => {
    if (seen.has(id)) problems.push(`${where}: duplicate id ${id}`)
    seen.add(id)
  }

  for (const c of characters) {
    note(c.id, `character ${c.id}`)
    if (c.encounters.length !== 8) problems.push(`${c.id}: has ${c.encounters.length} encounters, needs 8`)
    for (const a of ARCHETYPES) {
      const count = c.encounters.filter(e => e.archetype === a).length
      if (count !== 1) problems.push(`${c.id}: needs exactly one ${a} encounter, has ${count}`)
    }

    for (const e of c.encounters) {
      const where = `${c.id}/${e.id}`
      note(e.id, where)
      if (e.characterId !== c.id) problems.push(`${where}: characterId is ${e.characterId}`)
      if (CATEGORY_OF[e.archetype] !== e.category) problems.push(`${where}: ${e.archetype} must be ${CATEGORY_OF[e.archetype]}`)
      if (e.choices.length < 2 || e.choices.length > 3) problems.push(`${where}: needs 2-3 choices, has ${e.choices.length}`)
      const correct = e.choices.filter(ch => ch.isCorrect).length
      if (correct !== 1) problems.push(`${where}: needs exactly 1 correct choice, has ${correct}`)
      for (const ch of e.choices) {
        note(ch.id, where)
        if (ch.isCorrect && ch.consequence.kind !== 'none') problems.push(`${where}: correct choice ${ch.id} should have no consequence`)
      }

      const artifactIds = new Set(e.artifacts.map(a => a.id))
      for (const a of e.artifacts) note(a.id, where)
      if (e.artifacts.length === 0) problems.push(`${where}: has no artifacts to investigate`)
      for (const r of e.clue.requires) {
        if (!artifactIds.has(r)) problems.push(`${where}: clue needs unknown artifact ${r}`)
      }
      note(e.clue.id, where)
      for (const h of e.hints) {
        if (h.highlightArtifactId && !artifactIds.has(h.highlightArtifactId)) {
          problems.push(`${where}: hint highlights unknown artifact ${h.highlightArtifactId}`)
        }
      }
    }
  }
  return problems
}
