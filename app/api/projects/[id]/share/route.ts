import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'

/** POST /api/projects/[id]/share — generate a share token */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId } = await params

  // Verify ownership
  const check = await supabaseFetch(
    `/forge_projects?id=eq.${projectId}&github_username=eq.${encodeURIComponent(session.githubUsername)}&select=id,share_token`,
  )
  if (!check.ok || !Array.isArray(check.data) || check.data.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const existing = (check.data[0] as any).share_token
  if (existing) {
    return NextResponse.json({ token: existing })
  }

  // Generate a unique token
  const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16)

  const { ok } = await supabaseFetch(
    `/forge_projects?id=eq.${projectId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ share_token: token }),
    },
  )

  if (!ok) return NextResponse.json({ error: 'Failed to generate share link' }, { status: 500 })
  return NextResponse.json({ token })
}
