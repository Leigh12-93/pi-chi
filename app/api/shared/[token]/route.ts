import { NextResponse } from 'next/server'
import { supabaseFetch } from '@/lib/supabase-fetch'

/** GET /api/shared/[token] — public read-only project view */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  // Find project by share token
  const { data: projects, ok } = await supabaseFetch(
    `/forge_projects?share_token=eq.${encodeURIComponent(token)}&select=id,name,description,framework,github_username`,
  )

  if (!ok || !Array.isArray(projects) || projects.length === 0) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const project = projects[0] as any

  // Load project files
  const { data: files, ok: filesOk } = await supabaseFetch(
    `/forge_project_files?project_id=eq.${project.id}&select=file_path,content`,
  )

  const fileMap: Record<string, string> = {}
  if (filesOk && Array.isArray(files)) {
    for (const f of files as any[]) {
      fileMap[f.file_path] = f.content
    }
  }

  const response = NextResponse.json({
    name: project.name,
    description: project.description,
    framework: project.framework,
    githubUsername: project.github_username,
    files: fileMap,
  })

  // Cache for 5 minutes
  response.headers.set('Cache-Control', 'public, max-age=300')
  return response
}
