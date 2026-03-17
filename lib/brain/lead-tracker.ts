/* ─── Pi-Chi Lead Tracker — CheapSkip Revenue Analytics ───────
 * Tracks leads, revenue, and provider performance against
 * CheapSkip Supabase quote_requests table.
 * ─────────────────────────────────────────────────────────── */

import { LEAD_PRICE_AUD } from './business-rules'

// Dynamic import to avoid build-time env issues on Pi
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _supabase: any = null

async function getSupabase() {
  if (_supabase) return _supabase
  try {
    const { cheapskipSupabase } = await import('@/lib/cheapskip-supabase')
    _supabase = cheapskipSupabase
    return _supabase
  } catch {
    return null
  }
}

export interface LeadStats {
  today: number
  thisWeek: number
  thisMonth: number
  total: number
  revenueToday: number
  revenueThisWeek: number
  revenueThisMonth: number
  revenueTotal: number
}

export interface ProviderStats {
  providerId: string
  providerName: string
  totalLeads: number
  respondedLeads: number
  responseRate: number
  revenue: number
}

/** Track a new lead (call after inserting into Supabase) */
export async function trackLead(
  _providerId: string,
  source: string,
  leadId?: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await getSupabase()
  if (!supabase) return { success: false, error: 'CheapSkip Supabase not configured' }

  try {
    // Update the lead's source if we have a leadId
    if (leadId) {
      await supabase
        .from('quote_requests')
        .update({ source })
        .eq('id', leadId)
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Get lead stats for dashboard and brain context */
export async function getLeadStats(): Promise<LeadStats | null> {
  const supabase = await getSupabase()
  if (!supabase) return null

  try {
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // Total count
    const { count: total } = await supabase
      .from('quote_requests')
      .select('*', { count: 'exact', head: true })

    // Today
    const { count: today } = await supabase
      .from('quote_requests')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayStr)

    // This week
    const { count: thisWeek } = await supabase
      .from('quote_requests')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', weekAgo)

    // This month
    const { count: thisMonth } = await supabase
      .from('quote_requests')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', monthAgo)

    const t = total ?? 0
    const d = today ?? 0
    const w = thisWeek ?? 0
    const m = thisMonth ?? 0

    return {
      today: d,
      thisWeek: w,
      thisMonth: m,
      total: t,
      revenueToday: d * LEAD_PRICE_AUD,
      revenueThisWeek: w * LEAD_PRICE_AUD,
      revenueThisMonth: m * LEAD_PRICE_AUD,
      revenueTotal: t * LEAD_PRICE_AUD,
    }
  } catch (err) {
    console.error('[lead-tracker] Failed to get lead stats:', err)
    return null
  }
}

/** Get provider-level performance */
export async function getProviderPerformance(): Promise<ProviderStats[]> {
  const supabase = await getSupabase()
  if (!supabase) return []

  try {
    // Get all providers
    const { data: providers } = await supabase
      .from('providers')
      .select('id, business_name')

    if (!providers || providers.length === 0) return []

    const stats: ProviderStats[] = []
    for (const provider of providers.slice(0, 20)) { // Cap at 20 to avoid excessive queries
      const { count: totalLeads } = await supabase
        .from('quote_requests')
        .select('*', { count: 'exact', head: true })
        .eq('provider_id', provider.id)

      const { count: respondedLeads } = await supabase
        .from('quote_requests')
        .select('*', { count: 'exact', head: true })
        .eq('provider_id', provider.id)
        .eq('status', 'responded')

      const t = totalLeads ?? 0
      const r = respondedLeads ?? 0

      stats.push({
        providerId: provider.id,
        providerName: provider.business_name || 'Unknown',
        totalLeads: t,
        respondedLeads: r,
        responseRate: t > 0 ? Math.round((r / t) * 100) : 0,
        revenue: t * LEAD_PRICE_AUD,
      })
    }

    return stats.sort((a, b) => b.totalLeads - a.totalLeads)
  } catch (err) {
    console.error('[lead-tracker] Failed to get provider performance:', err)
    return []
  }
}

/** Get a revenue snapshot string for brain cycle context */
export async function getRevenueSnapshotString(): Promise<string> {
  const stats = await getLeadStats()
  if (!stats) return 'Lead tracking unavailable (CheapSkip Supabase not configured)'

  return `Leads today: ${stats.today} ($${stats.revenueToday}) | This week: ${stats.thisWeek} ($${stats.revenueThisWeek}) | This month: ${stats.thisMonth} ($${stats.revenueThisMonth}) | Total: ${stats.total} ($${stats.revenueTotal})`
}
