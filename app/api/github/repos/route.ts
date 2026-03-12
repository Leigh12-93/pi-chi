import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const url = new URL(req.url)
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
  const perPage = Math.min(Math.max(1, parseInt(url.searchParams.get('per_page') || '30')), 100)

  try {
    const res = await fetch(
      `https://api.github.com/user/repos?sort=pushed&per_page=${perPage}&page=${page}&type=owner`,
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    )

    if (!res.ok) {
      return NextResponse.json({ error: `GitHub API ${res.status}` }, { status: res.status })
    }

    const repos = await res.json()

    const slim = repos.map((r: any) => ({
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      description: r.description || '',
      language: r.language || '',
      private: r.private,
      fork: r.fork || false,
      archived: r.archived || false,
      default_branch: r.default_branch,
      updated_at: r.pushed_at || r.updated_at,
      html_url: r.html_url,
      stargazers_count: r.stargazers_count,
      size: r.size || 0,
    }))

    return NextResponse.json({
      repos: slim,
      page,
      perPage,
      hasMore: slim.length === perPage,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
