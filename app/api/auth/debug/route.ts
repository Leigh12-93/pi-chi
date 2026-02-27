import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { cookies } from 'next/headers'

export async function GET() {
  const session = await auth()
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()

  return NextResponse.json({
    hasSession: !!session,
    user: session?.user || null,
    githubUsername: (session as any)?.githubUsername || null,
    accessToken: (session as any)?.accessToken ? 'present' : 'missing',
    cookies: allCookies.map(c => ({ name: c.name, length: c.value.length })),
  })
}
