import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

const VERCEL_OAUTH_CLIENT_ID = (process.env.VERCEL_OAUTH_CLIENT_ID || '').trim()
const BASE_URL = (process.env.AUTH_URL || process.env.NEXTAUTH_URL || 'http://localhost:3333').trim()
const REDIRECT_URI = `${BASE_URL}/api/auth/vercel/callback`

/** GET /api/auth/vercel — start Vercel OAuth flow */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!VERCEL_OAUTH_CLIENT_ID) {
    return NextResponse.json({ error: 'Vercel OAuth not configured' }, { status: 500 })
  }

  const state = crypto.randomUUID()

  // Vercel Integration install URL
  const authUrl = new URL('https://vercel.com/integrations/forge-ai/new')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)

  const response = NextResponse.redirect(authUrl.toString())
  response.cookies.set('vercel_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return response
}
