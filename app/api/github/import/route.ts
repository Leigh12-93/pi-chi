import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

// Recursively fetch all files from a GitHub repo tree
async function fetchTree(owner: string, repo: string, branch: string, token: string): Promise<Record<string, string>> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  )

  if (!res.ok) {
    throw new Error(`Failed to fetch tree: ${res.status}`)
  }

  const data = await res.json()
  const files: Record<string, string> = {}

  // Filter to text files only, skip large files and binaries
  const textExtensions = new Set([
    'ts', 'tsx', 'js', 'jsx', 'json', 'css', 'scss', 'html', 'md', 'mdx',
    'txt', 'yaml', 'yml', 'toml', 'env', 'sql', 'sh', 'bash', 'py',
    'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'cpp', 'h', 'xml',
    'svg', 'graphql', 'gql', 'prisma', 'dockerfile', 'gitignore',
    'eslintrc', 'prettierrc', 'editorconfig', 'npmrc',
  ])

  const skipDirs = new Set([
    'node_modules', '.git', '.next', 'dist', 'build', '.vercel',
    '.turbo', 'coverage', '__pycache__', '.cache',
  ])

  const blobs = data.tree?.filter((item: any) => {
    if (item.type !== 'blob') return false
    if (item.size > 100000) return false // Skip files > 100KB

    // Skip files in ignored directories
    const parts = item.path.split('/')
    if (parts.some((p: string) => skipDirs.has(p))) return false

    // Check extension
    const ext = item.path.split('.').pop()?.toLowerCase() || ''
    const basename = item.path.split('/').pop() || ''

    // Allow extensionless config files
    if (['Dockerfile', 'Makefile', '.gitignore', '.env', '.env.local', '.env.example'].includes(basename)) return true

    return textExtensions.has(ext)
  }) || []

  // Fetch file contents in parallel (max 30 files to avoid rate limits)
  const filesToFetch = blobs.slice(0, 100)

  const results = await Promise.allSettled(
    filesToFetch.map(async (item: any) => {
      const fileRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${item.path}?ref=${branch}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      )

      if (!fileRes.ok) return null

      const fileData = await fileRes.json()
      if (fileData.encoding === 'base64' && fileData.content) {
        const content = Buffer.from(fileData.content, 'base64').toString('utf-8')
        return { path: item.path, content }
      }
      return null
    })
  )

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      files[result.value.path] = result.value.content
    }
  }

  return files
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await req.json()
  const { owner, repo, branch } = body

  if (!owner || !repo) {
    return NextResponse.json({ error: 'owner and repo required' }, { status: 400 })
  }

  try {
    const files = await fetchTree(owner, repo, branch || 'main', session.accessToken)
    return NextResponse.json({
      files,
      fileCount: Object.keys(files).length,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
