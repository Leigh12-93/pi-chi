import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { cookies } from 'next/headers'

export async function GET(req: Request) {
  const session = await auth()
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()

  // Also test GitHub token exchange directly
  let githubTest = null
  try {
    const clientId = (process.env.GITHUB_CLIENT_ID || '').trim()
    const clientSecret = (process.env.GITHUB_CLIENT_SECRET || '').trim()

    // Test that client credentials are valid by hitting the GitHub API
    const res = await fetch('https://api.github.com/applications/' + clientId, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64'),
        'Accept': 'application/vnd.github.v3+json',
      },
    })
    githubTest = {
      status: res.status,
      ok: res.ok,
      clientIdLength: clientId.length,
      clientSecretLength: clientSecret.length,
      body: res.ok ? 'valid credentials' : await res.text().then(t => t.substring(0, 200)),
    }
  } catch (e: any) {
    githubTest = { error: e.message }
  }

  return NextResponse.json({
    hasSession: !!session,
    user: session?.user || null,
    githubUsername: (session as any)?.githubUsername || null,
    accessToken: (session as any)?.accessToken ? 'present' : 'missing',
    cookies: allCookies.map(c => ({ name: c.name, length: c.value.length })),
    githubCredentials: githubTest,
    env: {
      AUTH_SECRET: process.env.AUTH_SECRET ? `${process.env.AUTH_SECRET.length} chars` : 'MISSING',
      AUTH_URL: process.env.AUTH_URL || 'MISSING',
      GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID ? JSON.stringify(process.env.GITHUB_CLIENT_ID) : 'MISSING',
      GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET ? `${process.env.GITHUB_CLIENT_SECRET.length} chars` : 'MISSING',
    }
  })
}
