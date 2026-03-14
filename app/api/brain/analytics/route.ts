/* ─── Analytics API — Snapshot History for Dashboard ──────── */

import { NextResponse } from 'next/server'
import { readSnapshots } from '@/lib/brain/analytics'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const days = parseInt(searchParams.get('days') || '7', 10)

    const snapshots = readSnapshots(days)
    return NextResponse.json({ snapshots })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
