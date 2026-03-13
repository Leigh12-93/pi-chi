import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isValidUUID } from '@/lib/validate'

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/pi_tasks?id=eq.${encodeURIComponent(id)}&select=*`, {
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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
  }

  const body = await req.json()

  if (body.status !== 'cancelled') {
    return NextResponse.json({ error: 'Only status: "cancelled" is supported' }, { status: 400 })
  }

  // Only allow cancelling tasks the user owns
  const res = await fetch(`${SUPABASE_URL}/rest/v1/pi_tasks?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({ status: 'cancelled', error: 'Cancelled by user' }),
  })

  if (!res.ok) {
    return NextResponse.json({ error: `Failed to cancel task: ${res.status}` }, { status: 500 })
  }

  const data = await res.json()
  if (!Array.isArray(data) || data.length === 0) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }
  return NextResponse.json(data[0])
}
