import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    // Fetch user's repos (sorted by most recently pushed)
    const res = await fetch(
      'https://api.github.com/user/repos?sort=pushed&per_page=50&type=owner',
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

    // Return slim data
    const slim = repos.map((r: any) => ({
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      description: r.description || '',
      language: r.language || '',
      private: r.private,
      default_branch: r.default_branch,
      updated_at: r.pushed_at || r.updated_at,
      html_url: r.html_url,
      stargazers_count: r.stargazers_count,
    }))

    return NextResponse.json(slim)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
