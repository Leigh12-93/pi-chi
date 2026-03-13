import { NextResponse } from 'next/server'
import { getSession, encryptToken } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'
import { cookies } from 'next/headers'

/** GET /api/auth/supabase/callback — handle OAuth callback from Supabase */
export async function GET(req: Request) {
  const SUPABASE_OAUTH_CLIENT_ID = (process.env.SUPABASE_OAUTH_CLIENT_ID || '').trim()
  const SUPABASE_OAUTH_CLIENT_SECRET = (process.env.SUPABASE_OAUTH_CLIENT_SECRET || '').trim()
  const BASE_URL = (process.env.AUTH_URL || process.env.NEXTAUTH_URL || 'http://localhost:3333').trim()
  const REDIRECT_URI = `${BASE_URL}/api/auth/supabase/callback`

  const session = await getSession()
  if (!session) return NextResponse.redirect(`${BASE_URL}?error=unauthorized`)

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(`${BASE_URL}?supabase_error=${encodeURIComponent(error)}`)
  }

  if (!code) {
    return NextResponse.redirect(`${BASE_URL}?supabase_error=no_code`)
  }

  // Verify state
  const cookieStore = await cookies()
  const storedState = cookieStore.get('sb_oauth_state')?.value
  const codeVerifier = cookieStore.get('sb_oauth_verifier')?.value

  if (!storedState || storedState !== state) {
    return NextResponse.redirect(`${BASE_URL}?supabase_error=state_mismatch`)
  }

  if (!codeVerifier) {
    return NextResponse.redirect(`${BASE_URL}?supabase_error=missing_verifier`)
  }

  // Exchange code for token
  try {
    const tokenRes = await fetch('https://api.supabase.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${SUPABASE_OAUTH_CLIENT_ID}:${SUPABASE_OAUTH_CLIENT_SECRET}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      console.error('[supabase-oauth] Token exchange failed:', err)
      return NextResponse.redirect(`${BASE_URL}?supabase_error=token_exchange_failed`)
    }

    const tokens = await tokenRes.json()
    const accessToken = tokens.access_token

    if (!accessToken) {
      return NextResponse.redirect(`${BASE_URL}?supabase_error=no_access_token`)
    }

    // Save encrypted access token to user settings
    const encrypted = await encryptToken(accessToken)
    await supabaseFetch('/pi_user_settings', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        github_username: session.githubUsername,
        encrypted_supabase_access_token: `v1:${encrypted}`,
      }),
    })

    // Also save refresh token if provided
    if (tokens.refresh_token) {
      const encryptedRefresh = await encryptToken(tokens.refresh_token)
      await supabaseFetch(
        `/pi_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            encrypted_supabase_refresh_token: `v1:${encryptedRefresh}`,
          }),
        },
      )
    }

    // Clean up cookies
    const response = NextResponse.redirect(`${BASE_URL}?supabase_connected=true`)
    response.cookies.delete('sb_oauth_state')
    response.cookies.delete('sb_oauth_verifier')
    return response
  } catch (err) {
    console.error('[supabase-oauth] Error:', err instanceof Error ? err.message : err)
    return NextResponse.redirect(`${BASE_URL}?supabase_error=exchange_error`)
  }
}
