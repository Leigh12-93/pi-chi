import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { createProjectSchema, parseBody } from '@/lib/api-schemas'

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

  const parsed = parseBody(createProjectSchema, await req.json())
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { name, description, framework, github_repo_url } = parsed.data

  // Check for duplicate project name — return existing project instead of error
  const { data: existing } = await supabase
    .from('forge_projects')
    .select('*')
    .eq('github_username', username)
    .eq('name', name)
    .limit(1)
    .single()
  if (existing) {
    return NextResponse.json(existing)
  }

  const insertData: Record<string, unknown> = {
    name,
    github_username: username,
    description,
    framework,
  }
  if (github_repo_url) insertData.github_repo_url = github_repo_url

  const { data, error } = await supabase
    .from('forge_projects')
    .insert(insertData)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
