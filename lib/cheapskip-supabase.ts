/* ─── CheapSkipBinsNearMe Supabase Client ─────────────────────── */

import { createClient } from '@supabase/supabase-js'

const CHEAPSKIP_URL = (process.env.CHEAPSKIP_SUPABASE_URL || '').trim()
const CHEAPSKIP_KEY = (process.env.CHEAPSKIP_SUPABASE_SERVICE_ROLE_KEY || '').trim()

if (!CHEAPSKIP_URL || !CHEAPSKIP_KEY) {
  console.warn('[cheapskip] Missing CheapSkip Supabase credentials')
}

export const cheapskipSupabase = CHEAPSKIP_URL && CHEAPSKIP_KEY
  ? createClient(CHEAPSKIP_URL, CHEAPSKIP_KEY)
  : null as unknown as ReturnType<typeof createClient>
