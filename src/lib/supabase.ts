import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config, isSupabaseConfigured } from '@/config'

let client: SupabaseClient | null = null

/**
 * Browser Supabase client using the public anon key only.
 * Sessions use Supabase Auth's recommended defaults: persisted session with
 * automatic token refresh; all data access is enforced by RLS on the server.
 */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  }
  return client
}

/** Turn Supabase/PostgREST errors into messages fit for the interface. */
export function friendlyError(error: unknown): string {
  const e = error as { message?: string; code?: string; details?: string } | null
  const message = e?.message ?? String(error)
  const code = e?.code
  if (code === '23505') {
    if (/slug/.test(message)) return 'That URL slug is already used by another business.'
    return 'A record with the same unique value already exists.'
  }
  if (code === '23503' || /still used/.test(message)) {
    return message.includes('still used') ? message : 'This item is still referenced elsewhere and cannot be removed.'
  }
  if (code === '23514') {
    if (/destination_valid/.test(message)) return 'The destination is not valid. Check the link, phone number or email address.'
    if (/public bucket/.test(message)) return 'Only public files can be shown to visitors.'
    if (/content_blocks_data_valid/.test(message)) return 'This block is missing required content.'
    return 'Some values are not valid. Check the highlighted fields.'
  }
  if (code === '42501' || /row-level security|permission denied|Administrator access required/i.test(message)) {
    return 'You do not have permission to do that. Sign in again with an administrator account.'
  }
  if (/Failed to fetch|NetworkError|network/i.test(message)) {
    return 'Could not reach the server. Check your connection and try again.'
  }
  if (/JWT expired|invalid JWT|refresh token/i.test(message)) {
    return 'Your session has expired. Sign in again.'
  }
  return message
}
