import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'

export async function GET() {
  // Pi local mode: skip GitHub auth, return a local session
  if (process.env.PI_LOCAL_MODE === 'true') {
    return NextResponse.json({
      user: { name: 'Leigh', email: 'local@pi-chi', image: '' },
      githubUsername: 'Leigh12-93',
      hasApiKey: true,
    })
  }

  const session = await getSession()
  if (!session) return NextResponse.json(null)

  // Check if user has a stored API key + subscription status
  let hasApiKey = false
  let subscription: { status: string; plan: string | null; endsAt: string | null } = { status: 'none', plan: null, endsAt: null }
  try {
    const { data, ok } = await supabaseFetch(
      `/pi_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}&select=encrypted_api_key,subscription_status,subscription_plan,subscription_current_period_end`,
    )
    if (ok && Array.isArray(data) && data.length > 0) {
      const row = data[0] as Record<string, unknown>
      hasApiKey = !!row.encrypted_api_key
      if (row.subscription_status && row.subscription_status !== 'none') {
        subscription = {
          status: row.subscription_status as string,
          plan: (row.subscription_plan as string) || null,
          endsAt: (row.subscription_current_period_end as string) || null,
        }
      }
    }
  } catch (err) {
    console.error('[auth/session] Failed to check API key:', err instanceof Error ? err.message : err)
  }

  const response = NextResponse.json({
    user: session.user,
    githubUsername: session.githubUsername,
    hasApiKey,
    subscription,
  })
  response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=120')
  return response
}
