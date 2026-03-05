import { NextResponse } from 'next/server'
import { getSession, decryptToken } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'

/** GET /api/db/external — return saved Supabase credentials (decrypted, for auto-connect) */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, ok } = await supabaseFetch(
    `/forge_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}&select=encrypted_supabase_url,encrypted_supabase_key`,
  )

  if (!ok || !Array.isArray(data) || data.length === 0 || !data[0].encrypted_supabase_url || !data[0].encrypted_supabase_key) {
    return NextResponse.json({ connected: false })
  }

  try {
    const row = data[0] as any
    const url = await decryptToken(row.encrypted_supabase_url.replace(/^v1:/, ''))
    const key = await decryptToken(row.encrypted_supabase_key.replace(/^v1:/, ''))
    const projectRef = url.match(/https:\/\/([^.]+)\.supabase/)?.[1] || ''
    return NextResponse.json({ connected: true, url, projectRef })
    // Note: key is NOT returned to the client — queries go through POST
  } catch {
    return NextResponse.json({ connected: false })
  }
}

/** POST /api/db/external — proxy SQL query to a user's Supabase instance */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { query, useSaved } = body
  let { supabaseUrl, supabaseKey } = body

  if (!query) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 })
  }

  // Load saved credentials if requested
  if (useSaved) {
    const { data, ok } = await supabaseFetch(
      `/forge_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}&select=encrypted_supabase_url,encrypted_supabase_key`,
    )
    if (!ok || !Array.isArray(data) || data.length === 0 || !data[0].encrypted_supabase_url) {
      return NextResponse.json({ error: 'No saved Supabase credentials' }, { status: 400 })
    }
    try {
      const row = data[0] as any
      supabaseUrl = await decryptToken(row.encrypted_supabase_url.replace(/^v1:/, ''))
      supabaseKey = await decryptToken(row.encrypted_supabase_key.replace(/^v1:/, ''))
    } catch {
      return NextResponse.json({ error: 'Failed to decrypt saved credentials' }, { status: 500 })
    }
  }

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Missing supabaseUrl, supabaseKey, or useSaved' }, { status: 400 })
  }

  // Validate URL format
  const url = supabaseUrl.trim().replace(/\/$/, '')
  if (!url.startsWith('https://') || !url.includes('supabase')) {
    return NextResponse.json({ error: 'Invalid Supabase URL' }, { status: 400 })
  }

  // Only allow safe read queries
  const trimmedQuery = query.trim().toLowerCase()
  if (!trimmedQuery.startsWith('select')) {
    return NextResponse.json({ error: 'Only SELECT queries are allowed' }, { status: 400 })
  }

  try {
    const res = await fetch(`${url}/rest/v1/rpc`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey.trim(),
        'Authorization': `Bearer ${supabaseKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(10000),
    })

    // If RPC doesn't work, try the PostgREST introspection endpoint
    if (!res.ok) {
      // Fallback: use the OpenAPI spec to get table names
      const specRes = await fetch(`${url}/rest/v1/`, {
        headers: {
          'apikey': supabaseKey.trim(),
          'Authorization': `Bearer ${supabaseKey.trim()}`,
        },
        signal: AbortSignal.timeout(10000),
      })

      if (specRes.ok) {
        const spec = await specRes.json()
        // PostgREST returns OpenAPI spec with paths = table names
        const tables = Object.keys(spec.paths || {})
          .map(p => p.replace(/^\//, ''))
          .filter(t => t && !t.startsWith('rpc/'))
          .sort()
        return NextResponse.json({ tables })
      }

      return NextResponse.json({ error: `Supabase query failed: ${res.status}` }, { status: 502 })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Connection failed' }, { status: 502 })
  }
}
