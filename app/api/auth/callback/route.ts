import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSession, COOKIE_NAME } from '@/lib/auth'
import { authLimiter } from '@/lib/rate-limit'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3333')).trim()

  // Rate limit auth callbacks
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const limit = authLimiter(ip)
  if (!limit.ok) {
    return NextResponse.redirect(baseUrl + '/?error=rate_limited')
  }

  if (error || !code) {
    return NextResponse.redirect(baseUrl + '/?error=' + (error || 'no_code'))
  }

  // CSRF: validate state parameter against cookie
  const cookieStore = await cookies()
  const storedState = cookieStore.get('oauth_state')?.value
  if (!state || !storedState || state !== storedState) {
    return NextResponse.redirect(baseUrl + '/?error=csrf_validation_failed')
  }

  // PKCE: retrieve code_verifier from cookie
  const codeVerifier = cookieStore.get('pkce_verifier')?.value

  try {
    // Exchange code for access token (include PKCE code_verifier)
    const tokenBody: Record<string, string> = {
      client_id: (process.env.GITHUB_CLIENT_ID || '').trim(),
      client_secret: (process.env.GITHUB_CLIENT_SECRET || '').trim(),
      code,
      redirect_uri: baseUrl + '/api/auth/callback',
    }
    if (codeVerifier) {
      tokenBody.code_verifier = codeVerifier
    }

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(tokenBody),
    })

    const tokenData = await tokenRes.json()

    if (tokenData.error) {
      console.error('[Auth] Token exchange failed:', tokenData)
      return NextResponse.redirect(baseUrl + '/?error=token_exchange_failed')
    }

    const accessToken = tokenData.access_token

    // Fetch user profile
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    })

    const user = await userRes.json()

    // Fetch user email (may be private)
    let email = user.email || ''
    if (!email) {
      const emailsRes = await fetch('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      })
      const emails = await emailsRes.json()
      const primary = emails.find?.((e: any) => e.primary) || emails[0]
      email = primary?.email || ''
    }

    // Create JWT session
    const jwt = await createSession({
      user: {
        name: user.name || user.login,
        email,
        image: user.avatar_url || '',
      },
      accessToken,
      githubUsername: user.login,
    })

    // Set session cookie, delete oauth_state cookie, and redirect home
    const response = NextResponse.redirect(baseUrl)
    response.cookies.set(COOKIE_NAME, jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    })
    response.cookies.delete('oauth_state')
    response.cookies.delete('pkce_verifier')

    return response
  } catch (err) {
    console.error('[Auth] Callback error:', err instanceof Error ? err.message : err)
    return NextResponse.redirect(baseUrl + '/?error=callback_failed')
  }
}
