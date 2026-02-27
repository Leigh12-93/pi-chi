import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params

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