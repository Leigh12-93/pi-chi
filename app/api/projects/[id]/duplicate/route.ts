import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { isValidUUID } from '@/lib/validate'

/** POST /api/projects/[id]/duplicate — duplicate a project with all its files */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isValidUUID(id)) return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })

  const session = await getSession()
  const username = session?.githubUsername
  if (!username) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Verify ownership and fetch project metadata
  const { data: project, error: projErr } = await supabase
    .from('forge_projects')
    .select('name, description, framework')
    .eq('id', id)
    .eq('github_username', username)
    .single()

  if (projErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Generate a unique copy name (append " (Copy)", " (Copy 2)", etc.)
  const baseCopyName = `${project.name} (Copy)`
  let copyName = baseCopyName

  const { data: existing } = await supabase
    .from('forge_projects')
    .select('name')
    .eq('github_username', username)
    .like('name', `${project.name} (Copy%`)

  if (existing && existing.length > 0) {
    const existingNames = new Set(existing.map((p: { name: string }) => p.name))
    if (existingNames.has(baseCopyName)) {
      let suffix = 2
      while (existingNames.has(`${project.name} (Copy ${suffix})`)) {
        suffix++
      }
      copyName = `${project.name} (Copy ${suffix})`
    }
  }

  // Create the new project
  const { data: newProject, error: insertErr } = await supabase
    .from('forge_projects')
    .insert({
      name: copyName,
      github_username: username,
      description: project.description || '',
      framework: project.framework || 'nextjs',
    })
    .select()
    .single()

  if (insertErr || !newProject) {
    console.error('[projects/duplicate] Failed to create project:', insertErr?.message)
    return NextResponse.json({ error: 'Failed to create duplicate project' }, { status: 500 })
  }

  // Copy all files from the original project
  const { data: files, error: filesErr } = await supabase
    .from('forge_project_files')
    .select('path, content')
    .eq('project_id', id)

  if (filesErr) {
    console.error('[projects/duplicate] Failed to read source files:', filesErr.message)
    // Project was created but files failed to copy — return partial success
    return NextResponse.json(newProject, { status: 201 })
  }

  if (files && files.length > 0) {
    const newFiles = files.map((f: { path: string; content: string }) => ({
      project_id: newProject.id,
      path: f.path,
      content: f.content,
    }))

    const { error: copyErr } = await supabase
      .from('forge_project_files')
      .insert(newFiles)

    if (copyErr) {
      console.error('[projects/duplicate] Failed to copy files:', copyErr.message)
      // Non-fatal — project exists, files partially copied
    }
  }

  return NextResponse.json(newProject, { status: 201 })
}
