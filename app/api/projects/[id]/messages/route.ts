import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

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

    // Fetch chat messages for this project
    const { data: messages, error } = await supabase
      .from('forge_chat_messages')
      .select('id, role, content, tool_invocations, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .limit(100)

    if (error) {
      console.error('Database error:', error)
      return Response.json({ error: 'Failed to load messages' }, { status: 500 })
    }

    return Response.json({ messages: messages || [] })
  } catch (error) {
    console.error('API error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
