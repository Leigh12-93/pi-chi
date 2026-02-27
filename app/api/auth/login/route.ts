import { NextResponse } from 'next/server'

export async function GET() {
  const clientId = (process.env.GITHUB_CLIENT_ID || '').trim()
  const baseUrl = (process.env.AUTH_URL || 'https://forge-six-chi.vercel.app').trim()
  const redirectUri = encodeURIComponent(baseUrl + '/api/auth/callback')
  const scope = encodeURIComponent('repo read:user user:email')
  const state = crypto.randomUUID()

  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`

  return NextResponse.redirect(url)
}
