import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('organizer secret is never exposed as a Vite variable or browser persistent storage', () => {
  const api = readFileSync(new URL('../src/event/api.ts', import.meta.url), 'utf8')
  const supabase = readFileSync(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8')
  const dashboard = readFileSync(new URL('../src/components/admin/OrganizerDashboard.tsx', import.meta.url), 'utf8')
  const edge = readFileSync(new URL('../supabase/functions/session-api/index.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(api, /VITE_ORGANIZER|ORGANIZER_ACCESS_TOKEN/)
  assert.doesNotMatch(supabase, /ORGANIZER_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(dashboard, /ORGANIZER_ACCESS_TOKEN|localStorage/)
  assert.doesNotMatch(api, /localStorage.*organizer|organizer.*localStorage/i)
  assert.match(api, /sessionStorage/)
  assert.match(edge, /requireAdminSession/)
  assert.match(edge, /x-admin-session/)
})

test('admin routes stay server-authorized and include lifecycle operations', () => {
  const edge = readFileSync(new URL('../supabase/functions/session-api/index.ts', import.meta.url), 'utf8')
  for (const action of [
    'admin-login',
    'admin-overview',
    'list-sessions',
    'get-session',
    'create',
    'set-status',
    'reset',
    'list-participants',
    'get-participant',
    'get-incident-analytics',
    'get-results',
    'export-results',
  ]) {
    assert.match(edge, new RegExp(`case '${action}'`))
  }
})

test('dashboard route is dedicated and separate from phone gameplay', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /window\.location\.pathname === '\/admin'/)
  assert.match(app, /<OrganizerDashboard \/>/)
  assert.match(app, /<App \/>/)
})
