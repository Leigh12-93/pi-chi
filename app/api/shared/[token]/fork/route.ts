import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'

/** POST /api/shared/[token]/fork — fork a shared project into the current user's account */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token } = await params

  // Load the shared project
  const { data: projects, ok } = await supabaseFetch(
    `/pi_projects?share_token=eq.${encodeURIComponent(token)}&select=id,name,description,framework`,
  )

  if (!ok || !Array.isArray(projects) || projects.length === 0) {
    return NextResponse.json({ error: 'Shared project not found' }, { status: 404 })
  }

  const source = projects[0] as any

  // Load source project files
  const { data: files, ok: filesOk } = await supabaseFetch(
    `/pi_project_files?project_id=eq.${source.id}&select=path,content`,
  )

  // Create forked project owned by current user
  const { data: newProject, ok: createOk } = await supabaseFetch('/pi_projects', {
    method: 'POST',
    body: JSON.stringify({
      name: `${source.name} (fork)`,
      description: source.description || '',
      framework: source.framework || 'nextjs',
      github_username: session.githubUsername,
    }),
  })

  if (!createOk || !Array.isArray(newProject) || newProject.length === 0) {
    return NextResponse.json({ error: 'Failed to create forked project' }, { status: 500 })
  }

  const forkedProject = newProject[0] as any

  // Copy files to the forked project
  if (filesOk && Array.isArray(files) && files.length > 0) {
    const rows = (files as any[]).map((f) => ({
      project_id: forkedProject.id,
      path: f.path,
      content: f.content,
    }))

    const { ok: insertOk } = await supabaseFetch('/pi_project_files', {
      method: 'POST',
      body: JSON.stringify(rows),
    })

    if (!insertOk) {
      // Clean up the empty project if file copy failed
      await supabaseFetch(`/pi_projects?id=eq.${forkedProject.id}`, { method: 'DELETE' })
      return NextResponse.json({ error: 'Failed to copy files' }, { status: 500 })
    }
  }

  return NextResponse.json({
    ok: true,
    project: {
      id: forkedProject.id,
      name: forkedProject.name,
      fileCount: Array.isArray(files) ? files.length : 0,
    },
  }, { status: 201 })
}
