import { test } from 'node:test'
import assert from 'node:assert/strict'

import { CHARACTERS } from '../src/game/content/index.ts'
import { progressiveAdvertisement } from '../src/components/applications/progressiveAd.ts'

test('progressive advertisements use character context and shuffled completion history', () => {
  for (const character of CHARACTERS) {
    const early = progressiveAdvertisement(character, [])
    assert.equal(early?.tone, 'ordinary')
    assert.equal(early?.suspicious, false)
    assert.ok(early?.description.includes(character.occupation.toLowerCase()))

    const completed = [...character.encounters].reverse()
    const middleHistory = [completed[6].id, completed[2].id]
    const middle = progressiveAdvertisement(character, middleHistory)
    assert.equal(middle?.tone, 'relevant')
    assert.ok(middle?.description.includes(completed[2].title))

    const lateHistory = completed.slice(0, 5).map(encounter => encounter.id)
    const late = progressiveAdvertisement(character, lateHistory)
    assert.equal(late?.tone, 'unsettling')
    assert.equal(late?.suspicious, true)
    assert.ok(late?.description.includes(completed[4].title))
  }
})
