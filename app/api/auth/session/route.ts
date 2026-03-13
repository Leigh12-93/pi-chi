import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json(null)

  // Check if user has a stored API key
  let hasApiKey = false
  try {
    const { data, ok } = await supabaseFetch(
      `/pi_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}&select=encrypted_api_key`,
    )
    if (ok && Array.isArray(data) && data.length > 0) {
      hasApiKey = !!(data[0] as any).encrypted_api_key
    }
  } catch (err) {
    console.error('[auth/session] Failed to check API key:', err instanceof Error ? err.message : err)
  }

  const response = NextResponse.json({
    user: session.user,
    githubUsername: session.githubUsername,
    hasApiKey,
  })
  response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=120')
  return response
}
