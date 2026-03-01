import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { isValidUUID } from '@/lib/validate'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { id: projectId } = await params

    if (!isValidUUID(projectId)) {
      return Response.json({ error: 'Invalid ID format' }, { status: 400 })
    }

    // Verify project ownership before returning messages
    const { data: project, error: projectError } = await supabase
      .from('forge_projects')
      .select('id, github_username')
      .eq('id', projectId)
      .single()

    if (projectError || !project) {
      return Response.json({ error: 'Project not found' }, { status: 404 })
    }

    if (project.github_username !== session.githubUsername) {
      return Response.json({ error: 'Access denied' }, { status: 403 })
    }

    // Parse pagination params
    const url = new URL(request.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100)
    const cursor = url.searchParams.get('cursor')

    // Fetch chat messages for this project with cursor-based pagination
    let query = supabase
      .from('forge_chat_messages')
      .select('id, role, content, tool_invocations, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (cursor) {
      query = query.gt('created_at', cursor)
    }

    const { data: messages, error } = await query

    if (error) {
      console.error('Database error:', error)
      return Response.json({ error: 'Failed to load messages' }, { status: 500 })
    }

    const nextCursor = messages && messages.length === limit
      ? messages[messages.length - 1].created_at
      : null

    return Response.json({ messages: messages || [], nextCursor })
  } catch (error) {
    console.error('API error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
