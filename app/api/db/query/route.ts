import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'
import { logger } from '@/lib/logger'
import { dbQuerySchema, parseBody } from '@/lib/api-schemas'

const ALLOWED_TABLE_PREFIX = 'forge_'

/** POST /api/db/query — run a read-only query on forge_* tables */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = parseBody(dbQuerySchema, await req.json())
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { query } = parsed.data

  // Security: only allow SELECT on forge_* tables
  const normalized = query.trim().toLowerCase()
  if (!normalized.startsWith('select')) {
    return NextResponse.json({ error: 'Only SELECT queries are allowed' }, { status: 403 })
  }

  // Block dangerous SQL patterns (UNION injection, subqueries, multiple statements)
  const DANGEROUS_PATTERNS = /\b(union|insert|update|delete|drop|alter|create|truncate|exec|execute|grant|revoke)\b|;|--|\/\*/i
  if (DANGEROUS_PATTERNS.test(normalized)) {
    return NextResponse.json({ error: 'Query contains disallowed SQL keywords' }, { status: 403 })
  }

  // Block subqueries (nested SELECT)
  if (/\(.*select/i.test(normalized)) {
    return NextResponse.json({ error: 'Subqueries are not allowed' }, { status: 403 })
  }

  // Extract ALL table names referenced (FROM + JOIN clauses) and verify they're forge_* tables
  const tableMatches = normalized.matchAll(/(?:from|join)\s+(\w+)/gi)
  const tables = [...tableMatches].map(m => m[1])
  if (tables.length === 0) {
    return NextResponse.json({ error: 'Could not parse table name' }, { status: 400 })
  }

  for (const table of tables) {
    if (!table.startsWith(ALLOWED_TABLE_PREFIX) || table.startsWith('pg_') || table.startsWith('information_schema')) {
      return NextResponse.json({ error: `Only ${ALLOWED_TABLE_PREFIX}* tables are accessible` }, { status: 403 })
    }
  }

  // Use PostgREST — parse query into safe parameterized request
  try {
    const tableName = tables[0]
    const limitMatch = normalized.match(/limit\s+(\d+)/)
    const limit = limitMatch ? Math.min(parseInt(limitMatch[1]), 100) : 20

    // Build PostgREST query params from WHERE clause
    let queryParams = `limit=${limit}&order=created_at.desc`

    // Parse simple WHERE conditions: column = 'value' or column = value
    const whereMatch = normalized.match(/where\s+(.+?)(?:\s+order|\s+limit|\s+group|\s*$)/)
    if (whereMatch) {
      const conditions = whereMatch[1].split(/\s+and\s+/)
      for (const cond of conditions) {
        const eqMatch = cond.trim().match(/^(\w+)\s*=\s*'?([^']+)'?$/)
        if (eqMatch) {
          queryParams += `&${encodeURIComponent(eqMatch[1])}=eq.${encodeURIComponent(eqMatch[2].trim())}`
        }
      }
    }

    // Parse select columns
    const selectMatch = normalized.match(/^select\s+(.+?)\s+from/)
    if (selectMatch && selectMatch[1].trim() !== '*') {
      const cols = selectMatch[1].split(',').map(c => c.trim()).filter(Boolean)
      if (cols.length > 0 && cols.every(c => /^\w+$/.test(c))) {
        queryParams += `&select=${cols.join(',')}`
      }
    }

    const { data, ok } = await supabaseFetch(
      `/${tableName}?${queryParams}`,
    )

    if (!ok) {
      return NextResponse.json({ error: 'Query failed' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    logger.error('Query failed', { error: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }
}
