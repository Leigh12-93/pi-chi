import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { isValidUUID } from '@/lib/validate'

// GET /api/projects/[id] — get project with all files
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isValidUUID(id)) return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
  const session = await getSession()
  const username = session?.githubUsername
  if (!username) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: project, error: projErr } = await supabase
    .from('pi_projects')
    .select('*, pi_project_files(path, content)')
    .eq('id', id)
    .eq('github_username', username)
    .single()

  if (projErr || !project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const fileMap: Record<string, string> = {}
  const fileRows = (project as Record<string, unknown>).pi_project_files as Array<{ path: string; content: string }> | undefined
  for (const f of fileRows || []) {
    fileMap[f.path] = f.content
  }

  // Remove nested relation from response, flatten to files map
  const { pi_project_files: _, ...projectData } = project as Record<string, unknown>
  return NextResponse.json({ ...projectData, files: fileMap })
}

// PUT /api/projects/[id] — save project files (upsert all)
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isValidUUID(id)) return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
  const session = await getSession()
  const username = session?.githubUsername
  if (!username) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Verify ownership
  const { data: project } = await supabase
    .from('pi_projects')
    .select('id')
    .eq('id', id)
    .eq('github_username', username)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const body = await req.json()

  // Update project metadata if provided
  if (body.name || body.description || body.framework || body.github_repo_url || body.vercel_url || body.memory !== undefined) {
    const updates: Record<string, unknown> = {}
    if (body.name) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.framework) updates.framework = body.framework
    if (body.github_repo_url) updates.github_repo_url = body.github_repo_url
    if (body.vercel_url) updates.vercel_url = body.vercel_url
    if (body.memory !== undefined) updates.memory = body.memory

    await supabase.from('pi_projects').update(updates).eq('id', id)
  }

  // Upsert files if provided
  if (body.files && typeof body.files === 'object') {
    const files = body.files as Record<string, string>
    const filePaths = Object.keys(files)

    // Validate file count
    if (filePaths.length > 500) {
      return NextResponse.json({ error: 'Too many files (max 500)' }, { status: 400 })
    }

    // Validate file paths — no directory traversal
    for (const path of filePaths) {
      if (path.includes('..') || path.startsWith('/') || path.includes('\\') || path.includes('\0')) {
        return NextResponse.json({ error: `Invalid file path: ${path}` }, { status: 400 })
      }
    }

    // Validate total content size (10MB max)
    let totalSize = 0
    for (const content of Object.values(files)) {
      if (typeof content !== 'string') {
        return NextResponse.json({ error: 'All file values must be strings' }, { status: 400 })
      }
      totalSize += content.length
      if (totalSize > 10 * 1024 * 1024) {
        return NextResponse.json({ error: 'Total file content too large (max 10MB)' }, { status: 400 })
      }
    }

    // Delete files that no longer exist — use safe parameterized filtering
    if (filePaths.length > 0) {
      const { data: existingFiles } = await supabase
        .from('pi_project_files')
        .select('path')
        .eq('project_id', id)

      const pathsToDelete = (existingFiles || [])
        .map((f: any) => f.path)
        .filter((p: string) => !filePaths.includes(p))

      if (pathsToDelete.length > 0) {
        await supabase
          .from('pi_project_files')
          .delete()
          .eq('project_id', id)
          .in('path', pathsToDelete)
      }
    } else {
      await supabase.from('pi_project_files').delete().eq('project_id', id)
    }

    // Upsert current files
    if (filePaths.length > 0) {
      const rows = filePaths.map(path => ({
        project_id: id,
        path,
        content: files[path],
      }))

      await supabase
        .from('pi_project_files')
        .upsert(rows, { onConflict: 'project_id,path' })
    }
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/projects/[id] — delete project
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isValidUUID(id)) return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
  const session = await getSession()
  const username = session?.githubUsername
  if (!username) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { error } = await supabase
    .from('pi_projects')
    .delete()
    .eq('id', id)
    .eq('github_username', username)

  if (error) {
    console.error('[projects/delete]', error.message)
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
