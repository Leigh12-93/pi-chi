import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json(null)

  // Strip accessToken — never expose PAT to client
  const response = NextResponse.json({
    user: session.user,
    githubUsername: session.githubUsername,
  })
  response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=120')
  return response
}
