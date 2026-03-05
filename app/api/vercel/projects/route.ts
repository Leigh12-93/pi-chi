import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { VERCEL_TOKEN, VERCEL_TEAM } from '@/lib/vercel'

/** GET /api/vercel/projects — list Vercel projects for dropdown picker */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!VERCEL_TOKEN) {
    return NextResponse.json({ error: 'VERCEL_TOKEN not configured' }, { status: 500 })
  }

  const teamParam = VERCEL_TEAM ? `?teamId=${VERCEL_TEAM}` : ''
  const res = await fetch(`https://api.vercel.com/v9/projects${teamParam}&limit=50`, {
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to fetch Vercel projects' }, { status: res.status })
  }

  const data = await res.json()
  const projects = (data.projects || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    url: p.targets?.production?.url ? `https://${p.targets.production.url}` : null,
  }))

  return NextResponse.json(projects)
}
