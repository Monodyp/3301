import { createClient } from '@supabase/supabase-js'

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''

let configurationError: string | null = null
let client: ReturnType<typeof createClient> | null = null

if (projectUrl || publishableKey) {
  if (!projectUrl || !publishableKey) {
    configurationError = 'Both Supabase URL and publishable key must be configured.'
  } else {
    try {
      const parsed = new URL(projectUrl)
      if (!['https:', 'http:'].includes(parsed.protocol)) {
        throw new Error('Supabase URL must use HTTP or HTTPS.')
      }
      client = createClient(projectUrl, publishableKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    } catch (error) {
      configurationError = error instanceof Error ? error.message : 'Supabase configuration is invalid.'
    }
  }
}

export const supabaseClient = client
export const supabaseConfigurationError = configurationError
export const isSupabaseConfigured = client !== null
export const hasSupabaseConfiguration = Boolean(projectUrl || publishableKey)
