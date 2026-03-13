import { NextResponse } from 'next/server'
import { getSession, decryptToken } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'

/** GET /api/auth/google — start Google OAuth flow using user's own Client ID */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const BASE_URL = (process.env.AUTH_URL || process.env.NEXTAUTH_URL || 'http://localhost:3333').trim()
  const REDIRECT_URI = `${BASE_URL}/api/auth/google/callback`

  // Fetch user's encrypted Client ID
  const { data, ok } = await supabaseFetch(
    `/pi_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}&select=encrypted_google_client_id`,
  )

  if (!ok || !Array.isArray(data) || data.length === 0 || !data[0].encrypted_google_client_id) {
    return NextResponse.json(
      { error: 'Configure OAuth credentials first. Save your Google Client ID and Secret in the Google panel.' },
      { status: 400 },
    )
  }

  let clientId: string
  try {
    clientId = await decryptToken((data[0].encrypted_google_client_id as string).replace(/^v1:/, ''))
  } catch (err) {
    console.error('[auth/google] Client ID decryption failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to decrypt Client ID' }, { status: 500 })
  }

  // Allow custom scopes via query param, or use sensible defaults
  const url = new URL(req.url)
  const scopeParam = url.searchParams.get('scope')
  const scopes = scopeParam || [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/gmail.send',
  ].join(' ')

  const state = crypto.randomUUID()

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', scopes)
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')
  authUrl.searchParams.set('state', state)

  const response = NextResponse.redirect(authUrl.toString())
  response.cookies.set('google_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return response
}
