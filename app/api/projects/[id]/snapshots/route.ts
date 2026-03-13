import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'

const MAX_SNAPSHOTS = 50

/** GET /api/projects/[id]/snapshots — list version snapshots */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId } = await params

  // Verify ownership
  const check = await supabaseFetch(
    `/pi_projects?id=eq.${projectId}&github_username=eq.${encodeURIComponent(session.githubUsername)}&select=id`,
  )
  if (!check.ok || !Array.isArray(check.data) || check.data.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data, ok } = await supabaseFetch(
    `/pi_project_snapshots?project_id=eq.${projectId}&select=id,description,file_count,created_at&order=created_at.desc&limit=50`,
  )

  if (!ok) return NextResponse.json([])
  return NextResponse.json(data)
}

/** POST /api/projects/[id]/snapshots — create a new snapshot */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId } = await params
  const body = await req.json()
  const { description, files } = body

  if (!description || !files) {
    return NextResponse.json({ error: 'description and files are required' }, { status: 400 })
  }

  // Verify ownership
  const check = await supabaseFetch(
    `/pi_projects?id=eq.${projectId}&github_username=eq.${encodeURIComponent(session.githubUsername)}&select=id`,
  )
  if (!check.ok || !Array.isArray(check.data) || check.data.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Auto-prune: delete oldest snapshots over limit
  const countRes = await supabaseFetch(
    `/pi_project_snapshots?project_id=eq.${projectId}&select=id&order=created_at.desc&offset=${MAX_SNAPSHOTS - 1}`,
  )
  if (countRes.ok && Array.isArray(countRes.data) && countRes.data.length > 0) {
    const idsToDelete = (countRes.data as any[]).map(r => r.id)
    for (const id of idsToDelete) {
      await supabaseFetch(`/pi_project_snapshots?id=eq.${id}`, { method: 'DELETE' })
    }
  }

  // Insert new snapshot
  const { data, ok } = await supabaseFetch('/pi_project_snapshots', {
    method: 'POST',
    body: JSON.stringify({
      project_id: projectId,
      description,
      files,
      file_count: Object.keys(files).length,
    }),
  })

  if (!ok) return NextResponse.json({ error: 'Failed to create snapshot' }, { status: 500 })
  return NextResponse.json(Array.isArray(data) ? data[0] : data, { status: 201 })
}
