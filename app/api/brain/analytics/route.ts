/* ─── Analytics API — Snapshot History + Lead/Revenue Metrics ── */

import { NextResponse } from 'next/server'
import { readSnapshots } from '@/lib/brain/analytics'
import { getLeadStats, getProviderPerformance } from '@/lib/brain/lead-tracker'
import { LEAD_PRICE_AUD } from '@/lib/brain/business-rules'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'snapshots'

    if (type === 'leads') {
      const [stats, providers] = await Promise.all([
        getLeadStats(),
        getProviderPerformance(),
      ])
      return NextResponse.json({
        leads: stats,
        providers,
        pricePerLead: LEAD_PRICE_AUD,
        revenue: stats ? {
          today: stats.today * LEAD_PRICE_AUD,
          thisWeek: stats.thisWeek * LEAD_PRICE_AUD,
          thisMonth: stats.thisMonth * LEAD_PRICE_AUD,
          total: stats.total * LEAD_PRICE_AUD,
        } : null,
      }, {
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      })
    }

    // Default: snapshot history
    const days = parseInt(searchParams.get('days') || '7', 10)
    const snapshots = readSnapshots(days)
    return NextResponse.json({ snapshots }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
