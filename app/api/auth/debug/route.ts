import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function GET() {
  const session = await auth()
  return NextResponse.json({
    hasSession: !!session,
    user: session?.user || null,
    githubUsername: (session as any)?.githubUsername || null,
    accessToken: (session as any)?.accessToken ? 'present' : 'missing',
    raw: session,
  })
}
