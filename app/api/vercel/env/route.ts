import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { VERCEL_TOKEN, VERCEL_TEAM } from '@/lib/vercel'

const teamParam = VERCEL_TEAM ? `?teamId=${VERCEL_TEAM}` : ''

/** GET /api/vercel/env?projectId=xxx — fetch env vars from Vercel project */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!VERCEL_TOKEN) return NextResponse.json({ error: 'VERCEL_TOKEN not configured' }, { status: 500 })

  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

  const res = await fetch(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/env${teamParam}`,
    { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } },
  )

  if (!res.ok) return NextResponse.json({ error: 'Failed to fetch env vars' }, { status: res.status })

  const data = await res.json()
  const envs = (data.envs || []).map((e: any) => ({
    key: e.key,
    value: e.value || '',
    target: e.target,
    type: e.type,
  }))

  return NextResponse.json(envs)
}

/** POST /api/vercel/env — push env vars to Vercel project */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!VERCEL_TOKEN) return NextResponse.json({ error: 'VERCEL_TOKEN not configured' }, { status: 500 })

  const body = await req.json()
  const { projectId, envVars } = body

  if (!projectId || !envVars || !Array.isArray(envVars)) {
    return NextResponse.json({ error: 'projectId and envVars[] required' }, { status: 400 })
  }

  const results: { key: string; ok: boolean; error?: string }[] = []

  for (const { key, value } of envVars) {
    if (!key) continue
    const res = await fetch(
      `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env${teamParam}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${VERCEL_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key,
          value: value || '',
          type: 'encrypted',
          target: ['production', 'preview', 'development'],
        }),
      },
    )
    if (res.ok) {
      results.push({ key, ok: true })
    } else {
      const err = await res.json().catch(() => ({}))
      results.push({ key, ok: false, error: err.error?.message || `HTTP ${res.status}` })
    }
  }

  return NextResponse.json({ results })
}
