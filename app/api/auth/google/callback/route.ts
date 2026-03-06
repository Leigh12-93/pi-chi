import { NextResponse } from 'next/server'
import { getSession, decryptToken, encryptToken } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'
import { cookies } from 'next/headers'

/** GET /api/auth/google/callback — exchange code for tokens, store encrypted */
export async function GET(req: Request) {
  const BASE_URL = (process.env.AUTH_URL || process.env.NEXTAUTH_URL || 'http://localhost:3333').trim()
  const REDIRECT_URI = `${BASE_URL}/api/auth/google/callback`

  const session = await getSession()
  if (!session) return NextResponse.redirect(`${BASE_URL}?google_error=unauthorized`)

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) {
    const errorParam = error === 'redirect_uri_mismatch' ? 'redirect_uri_mismatch' : encodeURIComponent(error)
    return NextResponse.redirect(`${BASE_URL}?google_error=${errorParam}`)
  }

  if (!code) {
    return NextResponse.redirect(`${BASE_URL}?google_error=no_code`)
  }

  // Verify state
  const cookieStore = await cookies()
  const storedState = cookieStore.get('google_oauth_state')?.value

  if (storedState && storedState !== state) {
    return NextResponse.redirect(`${BASE_URL}?google_error=state_mismatch`)
  }

  // Fetch + decrypt user's Client ID and Client Secret
  const { data, ok } = await supabaseFetch(
    `/forge_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}&select=encrypted_google_client_id,encrypted_google_client_secret`,
  )

  if (!ok || !Array.isArray(data) || data.length === 0) {
    return NextResponse.redirect(`${BASE_URL}?google_error=no_credentials`)
  }

  const row = data[0] as any
  if (!row.encrypted_google_client_id || !row.encrypted_google_client_secret) {
    return NextResponse.redirect(`${BASE_URL}?google_error=no_credentials`)
  }

  let clientId: string
  let clientSecret: string
  try {
    clientId = await decryptToken(row.encrypted_google_client_id.replace(/^v1:/, ''))
    clientSecret = await decryptToken(row.encrypted_google_client_secret.replace(/^v1:/, ''))
  } catch {
    return NextResponse.redirect(`${BASE_URL}?google_error=decrypt_failed`)
  }

  // Exchange code for tokens
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      console.error('[google-oauth] Token exchange failed:', err)
      return NextResponse.redirect(`${BASE_URL}?google_error=token_exchange_failed`)
    }

    const tokens = await tokenRes.json()
    const { access_token, refresh_token, expires_in, scope } = tokens

    if (!access_token) {
      return NextResponse.redirect(`${BASE_URL}?google_error=no_access_token`)
    }

    // Fetch user info for display
    let email = ''
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${access_token}` },
        signal: AbortSignal.timeout(10000),
      })
      if (userRes.ok) {
        const userInfo = await userRes.json()
        email = userInfo.email || ''
      }
    } catch {
      // Non-fatal — email is for display only
    }

    // Encrypt and store tokens
    const updates: Record<string, unknown> = {
      encrypted_google_access_token: `v1:${await encryptToken(access_token)}`,
      google_token_expiry: new Date(Date.now() + (expires_in || 3600) * 1000).toISOString(),
      google_connected_email: email,
      google_connected_scopes: scope ? scope.split(' ') : [],
    }

    if (refresh_token) {
      updates.encrypted_google_refresh_token = `v1:${await encryptToken(refresh_token)}`
    }

    await supabaseFetch('/forge_user_settings', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        github_username: session.githubUsername,
        ...updates,
      }),
    })

    // Clean up and redirect
    const response = NextResponse.redirect(`${BASE_URL}?google_connected=true`)
    response.cookies.delete('google_oauth_state')
    return response
  } catch (err: any) {
    console.error('[google-oauth] Error:', err)
    return NextResponse.redirect(`${BASE_URL}?google_error=exchange_error`)
  }
}
