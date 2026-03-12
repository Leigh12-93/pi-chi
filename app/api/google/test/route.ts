import { NextResponse } from 'next/server'
import { getSession, decryptToken, encryptToken } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'

const SERVICE_ENDPOINTS: Record<string, { url: string; label: string }> = {
  userinfo: { url: 'https://www.googleapis.com/oauth2/v2/userinfo', label: 'User Info' },
  drive: { url: 'https://www.googleapis.com/drive/v3/about?fields=user', label: 'Google Drive' },
  sheets: { url: 'https://sheets.googleapis.com/v4/spreadsheets?fields=spreadsheetId&pageSize=1', label: 'Google Sheets' },
  calendar: { url: 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1', label: 'Google Calendar' },
  gmail: { url: 'https://gmail.googleapis.com/gmail/v1/users/me/profile', label: 'Gmail' },
}

/** POST /api/google/test — test connection to a specific Google service */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { service } = body

  if (!service || !SERVICE_ENDPOINTS[service]) {
    return NextResponse.json(
      { error: `Invalid service. Must be one of: ${Object.keys(SERVICE_ENDPOINTS).join(', ')}` },
      { status: 400 },
    )
  }

  // Fetch credentials
  const { data, ok } = await supabaseFetch(
    `/forge_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}&select=encrypted_google_access_token,encrypted_google_refresh_token,encrypted_google_client_id,encrypted_google_client_secret,google_token_expiry`,
  )

  if (!ok || !Array.isArray(data) || data.length === 0) {
    return NextResponse.json({ ok: false, error: 'No Google credentials found' })
  }

  const row = data[0] as any
  if (!row.encrypted_google_access_token) {
    return NextResponse.json({ ok: false, error: 'No Google account connected' })
  }

  let accessToken: string
  try {
    accessToken = await decryptToken(row.encrypted_google_access_token.replace(/^v1:/, ''))
  } catch (err) {
    console.error('[google/test] decrypt access token failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ ok: false, error: 'Failed to decrypt access token' })
  }

  // Auto-refresh if token expired
  const expiry = row.google_token_expiry ? new Date(row.google_token_expiry) : null
  if (expiry && expiry.getTime() < Date.now() && row.encrypted_google_refresh_token && row.encrypted_google_client_id && row.encrypted_google_client_secret) {
    try {
      const clientId = await decryptToken(row.encrypted_google_client_id.replace(/^v1:/, ''))
      const clientSecret = await decryptToken(row.encrypted_google_client_secret.replace(/^v1:/, ''))
      const refreshToken = await decryptToken(row.encrypted_google_refresh_token.replace(/^v1:/, ''))

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

      if (tokenRes.ok) {
        const tokens = await tokenRes.json()
        accessToken = tokens.access_token
        // Store refreshed token
        await supabaseFetch('/forge_user_settings', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
          body: JSON.stringify({
            github_username: session.githubUsername,
            encrypted_google_access_token: `v1:${await encryptToken(accessToken)}`,
            google_token_expiry: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
          }),
        })
      }
    } catch (err) {
      console.error('[google/test] Token refresh failed, trying existing token:', err instanceof Error ? err.message : err)
    }
  }

  // Test the service
  const endpoint = SERVICE_ENDPOINTS[service]
  try {
    const res = await fetch(endpoint.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json({
        ok: false,
        error: `${endpoint.label}: ${(err as any).error?.message || `HTTP ${res.status}`}`,
      })
    }

    const responseData = await res.json().catch(() => ({}))
    return NextResponse.json({ ok: true, service, data: responseData })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: `${endpoint.label}: ${msg || 'Network error'}` })
  }
}
