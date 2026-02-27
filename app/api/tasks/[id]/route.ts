import { NextResponse } from 'next/server'

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const res = await fetch(`${SUPABASE_URL}/rest/v1/forge_tasks?id=eq.${id}&select=*`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Accept': 'application/json',
    },
  })

  if (!res.ok) {
    return NextResponse.json({ error: `Failed to fetch task: ${res.status}` }, { status: 500 })
  }

  const data = await res.json()
  if (!Array.isArray(data) || data.length === 0) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  return NextResponse.json(data[0])
}
