/* ─── Outreach Supabase Helper ──────────────────────────────────
 * Connects to the Bin Hire Australia Supabase instance.
 * Queries and updates the `providers` table for outreach tracking.
 * ─────────────────────────────────────────────────────────────── */

import { createClient } from '@supabase/supabase-js'

const CHEAPSKIP_URL = (process.env.CHEAPSKIP_SUPABASE_URL || '').trim()
const CHEAPSKIP_KEY = (process.env.CHEAPSKIP_SUPABASE_SERVICE_ROLE_KEY || '').trim()

function getClient() {
  if (!CHEAPSKIP_URL || !CHEAPSKIP_KEY) {
    throw new Error('[outreach/supabase] Missing CHEAPSKIP_SUPABASE_URL or CHEAPSKIP_SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(CHEAPSKIP_URL, CHEAPSKIP_KEY)
}

export interface OutreachProvider {
  id: number
  business_name: string
  phone: string
  suburb: string | null
  outreach_status: string
  outreach_count: number
  last_outreach_date: string | null
}

/**
 * Get providers that are pending outreach and have a phone number.
 */
export async function getPendingProviders(limit: number): Promise<OutreachProvider[]> {
  const supabase = getClient()
  const { data, error } = await supabase
    .from('providers')
    .select('id, business_name, phone, suburb, outreach_status, outreach_count, last_outreach_date')
    .not('phone', 'is', null)
    .eq('outreach_status', 'pending')
    .limit(limit)

  if (error) {
    throw new Error(`[outreach/supabase] getPendingProviders failed: ${error.message}`)
  }
  return (data || []) as OutreachProvider[]
}

/**
 * Update a provider's outreach status after a send attempt.
 */
export async function updateProviderStatus(
  provider_id: number,
  status: 'pending' | 'contacted' | 'replied' | 'declined' | 'active',
  count: number,
): Promise<void> {
  const supabase = getClient()
  const { error } = await supabase
    .from('providers')
    .update({
      outreach_status: status,
      outreach_count: count,
      outreach_date: new Date().toISOString(),
      last_outreach_date: new Date().toISOString(),
    })
    .eq('id', provider_id)

  if (error) {
    throw new Error(`[outreach/supabase] updateProviderStatus failed: ${error.message}`)
  }
}

/**
 * Quick connection test — counts pending providers.
 */
export async function testConnection(): Promise<{ ok: boolean; pendingCount: number; error?: string }> {
  try {
    const supabase = getClient()
    const { count, error } = await supabase
      .from('providers')
      .select('id', { count: 'exact', head: true })
      .not('phone', 'is', null)
      .eq('outreach_status', 'pending')

    if (error) return { ok: false, pendingCount: 0, error: error.message }
    return { ok: true, pendingCount: count || 0 }
  } catch (e) {
    return { ok: false, pendingCount: 0, error: e instanceof Error ? e.message : String(e) }
  }
}
