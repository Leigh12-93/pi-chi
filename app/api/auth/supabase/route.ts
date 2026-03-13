import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

/** GET /api/auth/supabase — start Supabase OAuth flow */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const SUPABASE_OAUTH_CLIENT_ID = (process.env.SUPABASE_OAUTH_CLIENT_ID || '').trim()
  const BASE_URL = (process.env.AUTH_URL || process.env.NEXTAUTH_URL || 'http://localhost:3333').trim()
  const REDIRECT_URI = `${BASE_URL}/api/auth/supabase/callback`

  if (!SUPABASE_OAUTH_CLIENT_ID) {
    return NextResponse.json({ error: 'Supabase OAuth not configured' }, { status: 500 })
  }

  // Generate PKCE code verifier + challenge
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)

  // Store verifier in a short-lived cookie
  const state = crypto.randomUUID()

  const authUrl = new URL('https://api.supabase.com/v1/oauth/authorize')
  authUrl.searchParams.set('client_id', SUPABASE_OAUTH_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')

  const response = NextResponse.redirect(authUrl.toString())
  // Store PKCE verifier + state in cookies (expire in 10 min)
  response.cookies.set('sb_oauth_verifier', codeVerifier, {
    httpOnly: true,
    secure: BASE_URL.startsWith('https'),
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  response.cookies.set('sb_oauth_state', state, {
    httpOnly: true,
    secure: BASE_URL.startsWith('https'),
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return response
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('')
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
