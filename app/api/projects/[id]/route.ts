import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { auth } from '@/lib/auth'

// GET /api/projects/[id] — get project with all files
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  const username = (session as any)?.githubUsername
  if (!username) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: project, error: projErr } = await supabase
    .from('forge_projects')
    .select('*')
    .eq('id', id)
    .eq('github_username', username)
    .single()

  if (projErr || !project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const { data: files } = await supabase
    .from('forge_project_files')
    .select('path, content')
    .eq('project_id', id)

  const fileMap: Record<string, string> = {}
  for (const f of files || []) {
    fileMap[f.path] = f.content
  }

  return NextResponse.json({ ...project, files: fileMap })
}

// PUT /api/projects/[id] — save project files (upsert all)
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  const username = (session as any)?.githubUsername
  if (!username) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Verify ownership
  const { data: project } = await supabase
    .from('forge_projects')
    .select('id')
    .eq('id', id)
    .eq('github_username', username)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const body = await req.json()

  // Update project metadata if provided
  if (body.name || body.description || body.framework || body.github_repo_url || body.vercel_url) {
    const updates: Record<string, unknown> = {}
    if (body.name) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.framework) updates.framework = body.framework
    if (body.github_repo_url) updates.github_repo_url = body.github_repo_url
    if (body.vercel_url) updates.vercel_url = body.vercel_url

    await supabase.from('forge_projects').update(updates).eq('id', id)
  }

  // Upsert files if provided
  if (body.files && typeof body.files === 'object') {
    const files = body.files as Record<string, string>
    const filePaths = Object.keys(files)

    // Delete files that no longer exist
    if (filePaths.length > 0) {
      await supabase
        .from('forge_project_files')
        .delete()
        .eq('project_id', id)
        .not('path', 'in', `(${filePaths.map(p => `"${p}"`).join(',')})`)
    } else {
      await supabase.from('forge_project_files').delete().eq('project_id', id)
    }

    // Upsert current files
    if (filePaths.length > 0) {
      const rows = filePaths.map(path => ({
        project_id: id,
        path,
        content: files[path],
      }))

      await supabase
        .from('forge_project_files')
        .upsert(rows, { onConflict: 'project_id,path' })
    }
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/projects/[id] — delete project
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  const username = (session as any)?.githubUsername
  if (!username) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { error } = await supabase
    .from('forge_projects')
    .delete()
    .eq('id', id)
    .eq('github_username', username)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
