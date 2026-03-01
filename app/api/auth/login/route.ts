import { NextResponse } from 'next/server'

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export async function GET() {
  const clientId = (process.env.GITHUB_CLIENT_ID || '').trim()
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3333')).trim()
  const redirectUri = encodeURIComponent(baseUrl + '/api/auth/callback')
  const scope = encodeURIComponent('repo read:user user:email')
  const state = crypto.randomUUID()

  // PKCE: Generate code_verifier (43-128 URL-safe chars) and code_challenge (S256)
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32))
  const codeVerifier = base64url(verifierBytes.buffer) // 43 chars
  const challengeDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
  const codeChallenge = base64url(challengeDigest)

  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`

  const response = NextResponse.redirect(url)
  response.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  })
  response.cookies.set('pkce_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  })

  return response
}
