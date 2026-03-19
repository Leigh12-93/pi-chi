import { NextResponse } from 'next/server'
import { readVitalsHistory } from '@/lib/vitals-history'

export const dynamic = 'force-dynamic'

/** GET /api/vitals/history — returns vitals trend data (up to 24h) */
export async function GET() {
  const history = readVitalsHistory()
  return NextResponse.json(history, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
