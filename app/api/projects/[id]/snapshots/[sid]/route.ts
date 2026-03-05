import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'

/** PUT /api/projects/[id]/snapshots/[sid] — restore a snapshot */
export async function PUT(
  req: Request,
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

  // Fetch snapshot
  const { data, ok } = await supabaseFetch(
    `/forge_project_snapshots?id=eq.${snapshotId}&project_id=eq.${projectId}&select=files`,
  )
  if (!ok || !Array.isArray(data) || data.length === 0) {
    return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })
  }

  const files = (data[0] as any).files
  return NextResponse.json({ files })
}
