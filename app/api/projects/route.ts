import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

// GET /api/projects — list user's projects
export async function GET() {
  const session = await getSession()
  const username = session?.githubUsername
  if (!username) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('forge_projects')
    .select('id, name, description, framework, github_repo_url, vercel_url, last_deploy_at, created_at, updated_at')
    .eq('github_username', username)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

// POST /api/projects — create a new project
export async function POST(req: Request) {
  const session = await getSession()
  const username = session?.githubUsername
  if (!username) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await req.json()
  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: 'Project name required' }, { status: 400 })

  const { data, error } = await supabase
    .from('forge_projects')
    .insert({
      name,
      github_username: username,
      description: body.description || '',
      framework: body.framework || 'nextjs',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
