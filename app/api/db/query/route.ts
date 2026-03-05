import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from '@/lib/supabase-fetch'

const ALLOWED_TABLE_PREFIX = 'forge_'

/** POST /api/db/query — run a read-only query on forge_* tables */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { query } = await req.json()
  if (!query || typeof query !== 'string') {
    return NextResponse.json({ error: 'query is required' }, { status: 400 })
  }

  // Security: only allow SELECT on forge_* tables
  const normalized = query.trim().toLowerCase()
  if (!normalized.startsWith('select')) {
    return NextResponse.json({ error: 'Only SELECT queries are allowed' }, { status: 403 })
  }

  // Extract table name and verify it's a forge_ table
  const tableMatch = normalized.match(/from\s+(\w+)/)
  if (!tableMatch) {
    return NextResponse.json({ error: 'Could not parse table name' }, { status: 400 })
  }

  const tableName = tableMatch[1]
  if (!tableName.startsWith(ALLOWED_TABLE_PREFIX)) {
    return NextResponse.json({ error: `Only ${ALLOWED_TABLE_PREFIX}* tables are accessible` }, { status: 403 })
  }

  // Use Supabase RPC or PostgREST
  try {
    // Simple approach: parse the query into a PostgREST request
    // For now, just do a basic table fetch with limit
    const limitMatch = normalized.match(/limit\s+(\d+)/)
    const limit = limitMatch ? Math.min(parseInt(limitMatch[1]), 100) : 20

    const { data, ok } = await supabaseFetch(
      `/${tableName}?limit=${limit}&order=created_at.desc`,
    )

    if (!ok) {
      return NextResponse.json({ error: 'Query failed' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Query failed' }, { status: 500 })
  }
}
