import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { isValidUUID } from '@/lib/validate'
import { VERCEL_TOKEN, VERCEL_TEAM } from '@/lib/vercel'
import { connectProjectSchema, parseBody } from '@/lib/api-schemas'

/** POST /api/projects/[id]/connect — connect GitHub repo and/or Vercel project */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isValidUUID(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership
  const { data: project } = await supabase
    .from('pi_projects')
    .select('id')
    .eq('id', id)
    .eq('github_username', session.githubUsername)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = parseBody(connectProjectSchema, await req.json())
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const updates: Record<string, unknown> = {}

  // Connect GitHub repo
  if (parsed.data.github_repo_url) {
    updates.github_repo_url = parsed.data.github_repo_url
  }

  // Validate and connect Vercel project
  if (parsed.data.vercel_project_id) {
    const vpId = parsed.data.vercel_project_id
    if (!VERCEL_TOKEN) {
      return NextResponse.json({ error: 'VERCEL_TOKEN not configured' }, { status: 500 })
    }
    const teamParam = VERCEL_TEAM ? `?teamId=${VERCEL_TEAM}` : ''
    const res = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(vpId)}${teamParam}`, {
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
    })
    if (!res.ok) {
      return NextResponse.json({ error: 'Vercel project not found' }, { status: 404 })
    }
    updates.vercel_project_id = vpId
  }

  const { error } = await supabase
    .from('pi_projects')
    .update(updates)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, ...updates })
}

/** DELETE /api/projects/[id]/connect — disconnect GitHub repo */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isValidUUID(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership
  const { data: project } = await supabase
    .from('pi_projects')
    .select('id')
    .eq('id', id)
    .eq('github_username', session.githubUsername)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase
    .from('pi_projects')
    .update({ github_repo_url: null })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
