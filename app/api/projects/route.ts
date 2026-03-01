import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

// GET /api/projects — list user's projects (with pagination)
export async function GET(req: Request) {
  const session = await getSession()
  const username = session?.githubUsername
  if (!username) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const url = new URL(req.url)
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit') || '20')), 50)
  const offset = (page - 1) * limit

  const { data, error } = await supabase
    .from('forge_projects')
    .select('id, name, description, framework, github_repo_url, vercel_url, last_deploy_at, created_at, updated_at')
    .eq('github_username', username)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ projects: data || [], page, limit, hasMore: (data || []).length === limit })
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
  if (name.length > 100) return NextResponse.json({ error: 'Project name too long (max 100 chars)' }, { status: 400 })
  if (!/^[\w\s\-\.()]+$/.test(name)) return NextResponse.json({ error: 'Project name contains invalid characters' }, { status: 400 })

  // Check for duplicate project name for this user
  const { data: existing } = await supabase
    .from('forge_projects')
    .select('id')
    .eq('github_username', username)
    .eq('name', name)
    .limit(1)
  if (existing && existing.length > 0) {
    return NextResponse.json({ error: 'A project with this name already exists' }, { status: 409 })
  }

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
