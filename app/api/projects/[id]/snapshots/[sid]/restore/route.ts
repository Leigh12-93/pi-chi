import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'

/** POST /api/projects/[id]/snapshots/[sid]/restore — restore snapshot files into project */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; sid: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId, sid: snapshotId } = await params

  // Verify project ownership
  const check = await supabaseFetch(
    `/forge_projects?id=eq.${projectId}&github_username=eq.${encodeURIComponent(session.githubUsername)}&select=id`,
  )
  if (!check.ok || !Array.isArray(check.data) || check.data.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Load snapshot
  const { data: snapData, ok: snapOk } = await supabaseFetch(
    `/forge_project_snapshots?id=eq.${snapshotId}&project_id=eq.${projectId}&select=files`,
  )
  if (!snapOk || !Array.isArray(snapData) || snapData.length === 0) {
    return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })
  }

  const files = (snapData[0] as any).files as Record<string, string> | null
  if (!files) {
    return NextResponse.json({ error: 'Snapshot has no files' }, { status: 400 })
  }

  // Delete current project files
  await supabaseFetch(`/forge_project_files?project_id=eq.${projectId}`, {
    method: 'DELETE',
  })

  // Insert snapshot files
  const rows = Object.entries(files).map(([path, content]) => ({
    project_id: projectId,
    path,
    content,
  }))

  if (rows.length > 0) {
    const { ok: insertOk } = await supabaseFetch('/forge_project_files', {
      method: 'POST',
      body: JSON.stringify(rows),
    })
    if (!insertOk) {
      return NextResponse.json({ error: 'Failed to restore files' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, fileCount: rows.length })
}
