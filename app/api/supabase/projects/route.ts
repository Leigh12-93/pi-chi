import { NextResponse } from 'next/server'
import { getSession, decryptToken } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'

/** GET /api/supabase/projects — list user's Supabase projects using their management API token */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Load the user's Supabase access token from settings
  const { data, ok } = await supabaseFetch(
    `/forge_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}&select=encrypted_supabase_access_token`,
  )

  if (!ok || !Array.isArray(data) || data.length === 0 || !data[0].encrypted_supabase_access_token) {
    return NextResponse.json({ error: 'No Supabase access token saved. Add one in Settings → Supabase.' }, { status: 400 })
  }

  let accessToken: string
  try {
    accessToken = await decryptToken(data[0].encrypted_supabase_access_token.replace(/^v1:/, ''))
  } catch {
    return NextResponse.json({ error: 'Failed to decrypt access token' }, { status: 500 })
  }

  try {
    const res = await fetch('https://api.supabase.com/v1/projects', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json({
        error: `Supabase API error: ${(err as any).message || `HTTP ${res.status}`}`,
      }, { status: res.status })
    }

    const projects = await res.json()
    // Return simplified list
    const simplified = (projects as any[]).map(p => ({
      id: p.id,
      ref: p.ref || p.id,
      name: p.name,
      region: p.region,
      status: p.status,
      url: `https://${p.ref || p.id}.supabase.co`,
    }))

    return NextResponse.json(simplified)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch projects' }, { status: 502 })
  }
}

/** POST /api/supabase/projects — fetch API keys for a specific project */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { projectRef } = body

  if (!projectRef) {
    return NextResponse.json({ error: 'Missing projectRef' }, { status: 400 })
  }

  // Load the user's Supabase access token
  const { data, ok } = await supabaseFetch(
    `/forge_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}&select=encrypted_supabase_access_token`,
  )

  if (!ok || !Array.isArray(data) || data.length === 0 || !data[0].encrypted_supabase_access_token) {
    return NextResponse.json({ error: 'No Supabase access token' }, { status: 400 })
  }

  let accessToken: string
  try {
    accessToken = await decryptToken(data[0].encrypted_supabase_access_token.replace(/^v1:/, ''))
  } catch {
    return NextResponse.json({ error: 'Failed to decrypt access token' }, { status: 500 })
  }

  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Failed to fetch API keys: HTTP ${res.status}` }, { status: 502 })
    }

    const keys = await res.json()
    const url = `https://${projectRef}.supabase.co`
    // Find service_role key first, fall back to anon
    const serviceRole = (keys as any[]).find(k => k.name === 'service_role')
    const anon = (keys as any[]).find(k => k.name === 'anon')
    const key = serviceRole?.api_key || anon?.api_key

    if (!key) {
      return NextResponse.json({ error: 'No API keys found for this project' }, { status: 404 })
    }

    return NextResponse.json({ url, key, keyType: serviceRole ? 'service_role' : 'anon' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch API keys' }, { status: 502 })
  }
}
