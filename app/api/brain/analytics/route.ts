/* ─── Analytics API — Snapshot History for Dashboard ──────── */

import { NextResponse } from 'next/server'
import { readSnapshots } from '@/lib/brain/analytics'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
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
