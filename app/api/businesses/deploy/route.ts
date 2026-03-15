import { NextRequest, NextResponse } from 'next/server'

/* ─── Deploy hook mapping ────────────────────────── */

const DEPLOY_HOOKS: Record<string, string | undefined> = {
  miniskip: (process.env.MINISKIP_DEPLOY_HOOK || '').trim() || undefined,
  bonkr: (process.env.BONKR_DEPLOY_HOOK || '').trim() || undefined,
  aussiesms: (process.env.AUSSIESMS_DEPLOY_HOOK || '').trim() || undefined,
  cheapskips: (process.env.CHEAPSKIP_DEPLOY_HOOK || '').trim() || undefined,
  pichi: (process.env.PICHI_DEPLOY_HOOK || '').trim() || undefined,
  awb: (process.env.AWB_DEPLOY_HOOK || '').trim() || undefined,
}

/* ─── POST /api/businesses/deploy ────────────────── */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { businessId } = body as { businessId?: string }

    if (!businessId) {
      return NextResponse.json({ error: 'Missing businessId' }, { status: 400 })
    }

    const hookUrl = DEPLOY_HOOKS[businessId]
    if (!hookUrl) {
      return NextResponse.json(
        { error: `No deploy hook configured for "${businessId}"` },
        { status: 404 },
      )
    }

    const res = await fetch(hookUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json(
        { error: `Deploy hook returned ${res.status}: ${text}` },
        { status: 502 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg || 'Unknown error' }, { status: 500 })
  }
}
