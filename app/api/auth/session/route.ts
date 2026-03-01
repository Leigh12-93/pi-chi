import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json(null)

  // Strip accessToken — never expose PAT to client
  return NextResponse.json({
    user: session.user,
    githubUsername: session.githubUsername,
  })
}
