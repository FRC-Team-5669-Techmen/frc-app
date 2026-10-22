import { createClient } from '@supabase/supabase-js'
import { storedSessionMemberId } from './scouting/offlineIdentity'

// Pin Supabase JS's existing default key, so offline scouting can identify the
// locally signed-in account without starting a network token refresh.
const authStorageKey = `sb-${new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`
export const getStoredSessionMemberId = () => storedSessionMemberId(authStorageKey)

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { storageKey: authStorageKey } },
)
