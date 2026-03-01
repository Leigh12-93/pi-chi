import { NextResponse } from 'next/server'
import { createSession, COOKIE_NAME } from '@/lib/auth'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const baseUrl = (process.env.AUTH_URL || 'https://forge-six-chi.vercel.app').trim()

  if (error || !code) {
    return NextResponse.redirect(baseUrl + '/?error=' + (error || 'no_code'))
  }

  // CSRF: validate state parameter against cookie
  const cookieHeader = req.headers.get('cookie') || ''
  const stateMatch = cookieHeader.match(/oauth_state=([^;]+)/)
  const storedState = stateMatch?.[1]
  if (!state || !storedState || state !== storedState) {
    return NextResponse.redirect(baseUrl + '/?error=csrf_validation_failed')
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: (process.env.GITHUB_CLIENT_ID || '').trim(),
        client_secret: (process.env.GITHUB_CLIENT_SECRET || '').trim(),
        code,
        redirect_uri: baseUrl + '/api/auth/callback',
      }),
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
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    })
    response.cookies.delete('oauth_state')

    return response
  } catch (err: any) {
    console.error('[Auth] Callback error:', err.message)
    return NextResponse.redirect(baseUrl + '/?error=callback_failed')
  }
}
