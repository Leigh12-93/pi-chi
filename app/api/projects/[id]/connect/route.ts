import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { isValidUUID } from '@/lib/validate'
import { VERCEL_TOKEN, VERCEL_TEAM } from '@/lib/vercel'

/** POST /api/projects/[id]/connect — connect GitHub repo and/or Vercel project */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isValidUUID(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership
  const { data: project } = await supabase
    .from('forge_projects')
    .select('id')
    .eq('id', id)
    .eq('github_username', session.githubUsername)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const updates: Record<string, unknown> = {}

  // Validate and connect GitHub repo
  if (body.github_repo_url) {
    const url = String(body.github_repo_url).trim()
    if (!url.startsWith('https://github.com/')) {
      return NextResponse.json({ error: 'Invalid GitHub URL' }, { status: 400 })
    }
    updates.github_repo_url = url
  }

  // Validate and connect Vercel project
  if (body.vercel_project_id) {
    const vpId = String(body.vercel_project_id).trim()
    if (!VERCEL_TOKEN) {
      return NextResponse.json({ error: 'VERCEL_TOKEN not configured' }, { status: 500 })
    }
    // Validate project exists on Vercel
    const teamParam = VERCEL_TEAM ? `?teamId=${VERCEL_TEAM}` : ''
    const res = await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(vpId)}${teamParam}`, {
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
    })
    if (!res.ok) {
      return NextResponse.json({ error: 'Vercel project not found' }, { status: 404 })
    }
    updates.vercel_project_id = vpId
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No connection parameters provided' }, { status: 400 })
  }

  const { error } = await supabase
    .from('forge_projects')
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
    .from('forge_projects')
    .select('id')
    .eq('id', id)
    .eq('github_username', session.githubUsername)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase
    .from('forge_projects')
    .update({ github_repo_url: null })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
