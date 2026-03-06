import { NextResponse } from 'next/server'
import { getSession, decryptToken, encryptToken } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'

/** POST /api/auth/google/refresh — refresh expired access token */
export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch encrypted credentials
  const { data, ok } = await supabaseFetch(
    `/forge_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}&select=encrypted_google_client_id,encrypted_google_client_secret,encrypted_google_refresh_token`,
  )

  if (!ok || !Array.isArray(data) || data.length === 0) {
    return NextResponse.json({ error: 'No Google credentials found' }, { status: 400 })
  }

  const row = data[0] as any
  if (!row.encrypted_google_client_id || !row.encrypted_google_client_secret || !row.encrypted_google_refresh_token) {
    return NextResponse.json({ error: 'Missing Google OAuth credentials or refresh token' }, { status: 400 })
  }

  let clientId: string
  let clientSecret: string
  let refreshToken: string
  try {
    clientId = await decryptToken(row.encrypted_google_client_id.replace(/^v1:/, ''))
    clientSecret = await decryptToken(row.encrypted_google_client_secret.replace(/^v1:/, ''))
    refreshToken = await decryptToken(row.encrypted_google_refresh_token.replace(/^v1:/, ''))
  } catch {
    return NextResponse.json({ error: 'Failed to decrypt credentials' }, { status: 500 })
  }

  // Refresh the token
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}))
      return NextResponse.json(
        { error: `Token refresh failed: ${(err as any).error_description || `HTTP ${tokenRes.status}`}` },
        { status: 400 },
      )
    }

    const tokens = await tokenRes.json()
    const { access_token, expires_in } = tokens

    if (!access_token) {
      return NextResponse.json({ error: 'No access token in refresh response' }, { status: 500 })
    }

    // Store new access token
    await supabaseFetch('/forge_user_settings', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        github_username: session.githubUsername,
        encrypted_google_access_token: `v1:${await encryptToken(access_token)}`,
        google_token_expiry: new Date(Date.now() + (expires_in || 3600) * 1000).toISOString(),
      }),
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: `Refresh failed: ${err.message || 'Network error'}` }, { status: 500 })
  }
}
