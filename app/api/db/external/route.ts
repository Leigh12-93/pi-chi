import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

/** POST /api/db/external — proxy SQL query to a user's Supabase instance */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { supabaseUrl, supabaseKey, query } = body

  if (!supabaseUrl || !supabaseKey || !query) {
    return NextResponse.json({ error: 'Missing supabaseUrl, supabaseKey, or query' }, { status: 400 })
  }

  // Validate URL format
  const url = supabaseUrl.trim().replace(/\/$/, '')
  if (!url.startsWith('https://') || !url.includes('supabase')) {
    return NextResponse.json({ error: 'Invalid Supabase URL' }, { status: 400 })
  }

  // Only allow safe read queries for introspection
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
