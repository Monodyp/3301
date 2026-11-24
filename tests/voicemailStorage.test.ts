import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addVoicemail, loadVoicemails, saveVoicemails } from '../src/components/applications/voicemailStorage.ts'

test('voicemails survive session restoration and do not duplicate a rejected encounter', () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }
  const voicemail = { id: 'voicemail-run-a-RF-R3', caller: 'Ben Cruz', message: 'Verify the request first.' }
  const saved = addVoicemail([], voicemail)
  const deduped = addVoicemail(saved, voicemail)
  assert.equal(deduped.length, 1)
  saveVoicemails('run-a', deduped, storage)
  assert.deepEqual(loadVoicemails('run-a', storage), [voicemail])
  assert.deepEqual(loadVoicemails('run-b', storage), [])
})
