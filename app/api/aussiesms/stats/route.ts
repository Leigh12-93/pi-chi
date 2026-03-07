import { NextResponse } from 'next/server'
import { getSession, decryptToken } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'

/** GET /api/aussiesms/stats — verify AussieSMS API key connectivity */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, ok } = await supabaseFetch(
    `/forge_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}&select=encrypted_aussiesms_api_key`,
  )

  if (!ok || !Array.isArray(data) || data.length === 0 || !data[0].encrypted_aussiesms_api_key) {
    return NextResponse.json({ connected: false })
  }

  let apiKey: string
  try {
    apiKey = await decryptToken(data[0].encrypted_aussiesms_api_key.replace(/^v1:/, ''))
  } catch {
    return NextResponse.json({ error: 'Failed to decrypt AussieSMS key' }, { status: 500 })
  }

  try {
    // Test connectivity by sending an empty request — 400 = valid key, 401 = invalid
    const res = await fetch('https://aussieotp.vercel.app/api/gateway/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10000),
    })

    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({ connected: false, error: 'API key is invalid or revoked' })
    }

    // Determine mode from key prefix
    const mode = apiKey.startsWith('sk_test_') ? 'test' : 'live'

    return NextResponse.json({ connected: true, mode })
  } catch (err: any) {
    return NextResponse.json({
      connected: false,
      error: `Failed to reach AussieSMS: ${err.message || 'Network error'}`,
    })
  }
}
