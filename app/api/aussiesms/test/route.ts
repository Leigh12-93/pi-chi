import { NextResponse } from 'next/server'
import { getSession, decryptToken } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'

/** POST /api/aussiesms/test — send a test SMS via AussieSMS gateway */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { to, message } = await req.json()
  if (!to || !message) {
    return NextResponse.json({ error: 'Missing "to" and "message" fields' }, { status: 400 })
  }

  const { data, ok } = await supabaseFetch(
    `/pi_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}&select=encrypted_aussiesms_api_key`,
  )

  if (!ok || !Array.isArray(data) || data.length === 0 || !data[0].encrypted_aussiesms_api_key) {
    return NextResponse.json({ error: 'No AussieSMS API key configured' }, { status: 400 })
  }

  let apiKey: string
  try {
    apiKey = await decryptToken(data[0].encrypted_aussiesms_api_key.replace(/^v1:/, ''))
  } catch (err) {
    console.error('[aussiesms/test] decrypt AussieSMS key failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to decrypt AussieSMS key' }, { status: 500 })
  }

  try {
    const res = await fetch('https://aussieotp.vercel.app/api/gateway/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ to, message }),
      signal: AbortSignal.timeout(15000),
    })

    const result = await res.json().catch(() => ({}))

    if (!res.ok) {
      return NextResponse.json({
        error: (result as any).error || `AussieSMS returned HTTP ${res.status}`,
      }, { status: res.status === 401 ? 401 : 400 })
    }

    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({
      error: `Failed to send SMS: ${msg || 'Network error'}`,
    }, { status: 500 })
  }
}
