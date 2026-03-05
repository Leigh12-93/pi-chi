import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { githubFetch } from '@/lib/github'

/** GET /api/github/branches?owner=X&repo=Y — list branches */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const owner = url.searchParams.get('owner')
  const repo = url.searchParams.get('repo')

  if (!owner || !repo) {
    return NextResponse.json({ error: 'owner and repo are required' }, { status: 400 })
  }

  try {
    const data = await githubFetch(`/repos/${owner}/${repo}/branches?per_page=50`, session.accessToken)
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to list branches' }, { status: 500 })
  }
}

/** POST /api/github/branches — create branch */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { owner, repo, branch, from = 'main' } = body

  if (!owner || !repo || !branch) {
    return NextResponse.json({ error: 'owner, repo, and branch are required' }, { status: 400 })
  }

  try {
    // Get the SHA of the source branch
    const refData = await githubFetch(`/repos/${owner}/${repo}/git/ref/heads/${from}`, session.accessToken)
    const sha = (refData as any).object?.sha

    if (!sha) {
      return NextResponse.json({ error: `Could not find branch "${from}"` }, { status: 404 })
    }

    // Create the new branch
    const result = await githubFetch(`/repos/${owner}/${repo}/git/refs`, session.accessToken, {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha,
      }),
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create branch' }, { status: 500 })
  }
}
