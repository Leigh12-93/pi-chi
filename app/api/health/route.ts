import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/** GET /api/health — liveness + readiness check */
export async function GET() {
  const checks: Record<string, boolean> = {}

  // Check Supabase connectivity
  try {
    const { error } = await supabase.from('pi_projects').select('id').limit(1)
    checks.database = !error
  } catch {
    checks.database = false
  }

  // Check required env vars
  checks.auth = !!(process.env.AUTH_SECRET || '').trim()
  checks.anthropic = !!(process.env.ANTHROPIC_API_KEY || '').trim()
  checks.github = !!(process.env.GITHUB_CLIENT_ID || '').trim()

  const healthy = Object.values(checks).every(Boolean)

  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', checks, timestamp: new Date().toISOString() },
    { status: healthy ? 200 : 503 },
  )
}
