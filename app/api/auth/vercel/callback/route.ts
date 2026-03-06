import { NextResponse } from 'next/server'
import { getSession, encryptToken } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'
import { cookies } from 'next/headers'

/** GET /api/auth/vercel/callback — handle OAuth callback from Vercel */
export async function GET(req: Request) {
  const VERCEL_OAUTH_CLIENT_ID = (process.env.VERCEL_OAUTH_CLIENT_ID || '').trim()
  const VERCEL_OAUTH_CLIENT_SECRET = (process.env.VERCEL_OAUTH_CLIENT_SECRET || '').trim()
  const BASE_URL = (process.env.AUTH_URL || process.env.NEXTAUTH_URL || 'http://localhost:3333').trim()
  const REDIRECT_URI = `${BASE_URL}/api/auth/vercel/callback`

  const session = await getSession()
  if (!session) return NextResponse.redirect(`${BASE_URL}?error=unauthorized`)

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(`${BASE_URL}?vercel_error=${encodeURIComponent(error)}`)
  }

  if (!code) {
    return NextResponse.redirect(`${BASE_URL}?vercel_error=no_code`)
  }

  // Verify state
  const cookieStore = await cookies()
  const storedState = cookieStore.get('vercel_oauth_state')?.value

  if (storedState && storedState !== state) {
    return NextResponse.redirect(`${BASE_URL}?vercel_error=state_mismatch`)
  }

  // Exchange code for token
  try {
    const tokenRes = await fetch('https://api.vercel.com/v2/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: VERCEL_OAUTH_CLIENT_ID,
        client_secret: VERCEL_OAUTH_CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      console.error('[vercel-oauth] Token exchange failed:', err)
      return NextResponse.redirect(`${BASE_URL}?vercel_error=token_exchange_failed`)
    }

    const tokens = await tokenRes.json()
    const accessToken = tokens.access_token

    if (!accessToken) {
      return NextResponse.redirect(`${BASE_URL}?vercel_error=no_access_token`)
    }

    // Validate the token works by listing projects
    const validateRes = await fetch('https://api.vercel.com/v9/projects?limit=1', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    })

    if (!validateRes.ok) {
      return NextResponse.redirect(`${BASE_URL}?vercel_error=token_invalid`)
    }

    // Save encrypted access token to user settings
    const encrypted = await encryptToken(accessToken)
    await supabaseFetch('/forge_user_settings', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        github_username: session.githubUsername,
        encrypted_vercel_token: `v1:${encrypted}`,
      }),
    })

    // Clean up cookies
    const response = NextResponse.redirect(`${BASE_URL}?vercel_connected=true`)
    response.cookies.delete('vercel_oauth_state')
    return response
  } catch (err: any) {
    console.error('[vercel-oauth] Error:', err)
    return NextResponse.redirect(`${BASE_URL}?vercel_error=exchange_error`)
  }
}
