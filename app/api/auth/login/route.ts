import { NextResponse } from 'next/server'

// Manual OAuth redirect — bypasses next-auth/react signIn() entirely
export async function GET() {
  const clientId = (process.env.GITHUB_CLIENT_ID || '').trim()
  const redirectUri = encodeURIComponent(
    (process.env.AUTH_URL || 'https://forge-six-chi.vercel.app') + '/api/auth/callback/github'
  )
  const state = crypto.randomUUID()
  const scope = encodeURIComponent('repo read:user user:email')

  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`

  return NextResponse.redirect(url)
}
