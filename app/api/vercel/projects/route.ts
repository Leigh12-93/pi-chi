import { NextResponse } from 'next/server'
import { getSession, decryptToken } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'
import { VERCEL_TOKEN, VERCEL_TEAM } from '@/lib/vercel'

/** GET /api/vercel/projects — list Vercel projects using user's saved token */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Try user's saved Vercel token first, fall back to server token
  let token = ''
  let useTeam = true

  const { data, ok } = await supabaseFetch(
    `/pi_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}&select=encrypted_vercel_token`,
  )

  if (ok && Array.isArray(data) && data.length > 0) {
    const row = data[0] as any
    if (row.encrypted_vercel_token) {
      try {
        token = await decryptToken(row.encrypted_vercel_token.replace(/^v1:/, ''))
        useTeam = false // user's personal token — no team param
      } catch (err) {
        console.error('[vercel/projects] decrypt Vercel token failed:', err instanceof Error ? err.message : err)
        // Decryption failed, fall through to server token
      }
    }
  }

  // Fall back to server deploy token
  if (!token) token = VERCEL_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'no_token', message: 'No Vercel token configured. Connect your Vercel account in Settings.' }, { status: 401 })
  }

  try {
    const teamParam = (useTeam && VERCEL_TEAM) ? `teamId=${VERCEL_TEAM}&` : ''
    const res = await fetch(`https://api.vercel.com/v9/projects?${teamParam}limit=50`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return NextResponse.json({ error: 'token_invalid', message: 'Vercel token is invalid or expired. Reconnect in Settings.' }, { status: 401 })
      }
      return NextResponse.json({ error: 'Failed to fetch Vercel projects' }, { status: res.status })
    }

    const json = await res.json()
    const projects = (json.projects || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      url: p.targets?.production?.url ? `https://${p.targets.production.url}` : null,
    }))

    return NextResponse.json(projects)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg || 'Network error' }, { status: 500 })
  }
}
