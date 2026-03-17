/* ─── Pi-Chi Lead Tracker — CheapSkip Revenue Analytics ───────
 * Tracks leads, revenue, and provider stats for CheapSkipBinsNearMe
 * via direct PostgREST fetch to CheapSkip's Supabase project.
 *
 * CheapSkip Supabase: pocoystpkrdmobplazhd
 * ─────────────────────────────────────────────────────────── */

import { LEAD_PRICE_AUD } from './business-rules'

// ── Config ───────────────────────────────────────────────────

const CHEAPSKIP_SUPABASE_URL = 'https://pocoystpkrdmobplazhd.supabase.co'

function getServiceRoleKey(): string | null {
  const key =
    process.env.CHEAPSKIP_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    null
  return key?.trim() ?? null
}

// ── PostgREST helper ─────────────────────────────────────────

async function cheapskipFetch(table: string, params?: string): Promise<Response> {
  const key = getServiceRoleKey()
  if (!key) throw new Error('CheapSkip service role key not configured')

  const url = `${CHEAPSKIP_SUPABASE_URL}/rest/v1/${table}${params ? `?${params}` : ''}`
  return fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'count=exact',
    },
  })
}

// ── Types ────────────────────────────────────────────────────

export interface LeadStats {
  today: number
  thisWeek: number
  thisMonth: number
}

export interface ProviderCount {
  total: number
  active: number
}

export interface RevenueSnapshot {
  today: number
  thisWeek: number
  thisMonth: number
}

// ── Date helpers ─────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

// ── Exported functions ───────────────────────────────────────

/** Count of quote_requests: today / this week (7d) / this month (30d) */
export async function getLeadStats(): Promise<LeadStats> {
  const today = todayISO()
  const weekAgo = daysAgoISO(7)
  const monthAgo = daysAgoISO(30)

  const [rToday, rWeek, rMonth] = await Promise.all([
    cheapskipFetch('quote_requests', `select=id&created_at=gte.${today}`),
    cheapskipFetch('quote_requests', `select=id&created_at=gte.${weekAgo}`),
    cheapskipFetch('quote_requests', `select=id&created_at=gte.${monthAgo}`),
  ])

  const countFrom = (r: Response) => {
    const range = r.headers.get('content-range') // e.g. "0-4/5" or "*/0"
    if (!range) return 0
    const total = range.split('/')[1]
    return total === '*' ? 0 : parseInt(total, 10) || 0
  }

  return {
    today: countFrom(rToday),
    thisWeek: countFrom(rWeek),
    thisMonth: countFrom(rMonth),
  }
}

/** Total and active (published=true) skip providers */
export async function getProviderCount(): Promise<ProviderCount> {
  const [rTotal, rActive] = await Promise.all([
    cheapskipFetch('skip_providers', 'select=id'),
    cheapskipFetch('skip_providers', 'select=id&published=eq.true'),
  ])

  const countFrom = (r: Response) => {
    const range = r.headers.get('content-range')
    if (!range) return 0
    const total = range.split('/')[1]
    return total === '*' ? 0 : parseInt(total, 10) || 0
  }

  return {
    total: countFrom(rTotal),
    active: countFrom(rActive),
  }
}

/** Revenue estimate: leads * $2 AUD, grouped by period */
export async function getRevenueSnapshot(): Promise<RevenueSnapshot> {
  const stats = await getLeadStats()
  return {
    today: stats.today * LEAD_PRICE_AUD,
    thisWeek: stats.thisWeek * LEAD_PRICE_AUD,
    thisMonth: stats.thisMonth * LEAD_PRICE_AUD,
  }
}

/** Single-line summary string for brain context / dashboard */
export async function getLeadSummary(): Promise<string> {
  try {
    const [stats, providers] = await Promise.all([
      getLeadStats(),
      getProviderCount(),
    ])
    const rev = stats.thisMonth * LEAD_PRICE_AUD
    return `Leads: ${stats.today} today / ${stats.thisWeek} week / ${stats.thisMonth} month | Revenue: $${rev} | Providers: ${providers.active} active`
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return `Lead tracking unavailable: ${msg}`
  }
}
