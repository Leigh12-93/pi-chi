import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { cookies } from 'next/headers'

export async function GET(req: Request) {
  const session = await auth()
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()

  // Test: manually try a token exchange with a fake code to see the error format
  let tokenTest = null
  try {
    const clientId = (process.env.GITHUB_CLIENT_ID || '').trim()
    const clientSecret = (process.env.GITHUB_CLIENT_SECRET || '').trim()

    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: 'test_fake_code',
      }),
    })
    const body = await res.json()
    tokenTest = {
      status: res.status,
      body: body,
    }
  } catch (e: any) {
    tokenTest = { error: e.message }
  }

  return NextResponse.json({
    hasSession: !!session,
    user: session?.user || null,
    cookies: allCookies.map(c => ({ name: c.name, length: c.value.length })),
    tokenTest,
    env: {
      GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID ? `${process.env.GITHUB_CLIENT_ID.length} chars` : 'MISSING',
      GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET ? `${process.env.GITHUB_CLIENT_SECRET.length} chars` : 'MISSING',
    }
  })
}
