import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

const GITHUB_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
})

// Text file extensions we import
const TEXT_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'css', 'scss', 'less',
  'html', 'htm', 'md', 'mdx', 'txt', 'yaml', 'yml', 'toml', 'env',
  'sql', 'sh', 'bash', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
  'c', 'cpp', 'h', 'hpp', 'xml', 'svg', 'graphql', 'gql', 'prisma',
  'dockerfile', 'gitignore', 'eslintrc', 'prettierrc', 'editorconfig',
  'npmrc', 'vue', 'svelte', 'astro',
])

// Directories to skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.vercel',
  '.turbo', 'coverage', '__pycache__', '.cache', '.output',
  '.nuxt', '.svelte-kit', '.astro', 'vendor', '.venv', 'venv',
])

// Lock and generated files to skip
const SKIP_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
  'composer.lock', 'Gemfile.lock', 'Cargo.lock', 'poetry.lock',
  '.DS_Store', 'Thumbs.db',
])

// Config files that are extensionless but should be included
const EXTENSIONLESS_INCLUDES = new Set([
  'Dockerfile', 'Makefile', '.gitignore', '.env', '.env.local',
  '.env.example', '.env.development', '.env.production',
  'Procfile', '.dockerignore', '.nvmrc', '.node-version',
])

/** Auto-detect the default branch for a repo */
async function getDefaultBranch(owner: string, repo: string, token: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: GITHUB_HEADERS(token),
  })
  if (!res.ok) return 'main'
  const data = await res.json()
  return data.default_branch || 'main'
}

/** Fetch file contents in batches to avoid GitHub rate limits */
async function fetchInBatches(
  items: { path: string; sha: string }[],
  owner: string,
  repo: string,
  branch: string,
  token: string,
  batchSize: number = 10,
): Promise<Record<string, string>> {
  const files: Record<string, string> = {}

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const results = await Promise.allSettled(
      batch.map(async (item) => {
        // Use the blob endpoint (faster than contents for known SHAs)
        const res = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/git/blobs/${item.sha}`,
          { headers: GITHUB_HEADERS(token) },
        )
        if (!res.ok) return null
        const data = await res.json()
        if (data.encoding === 'base64' && data.content) {
          return { path: item.path, content: Buffer.from(data.content, 'base64').toString('utf-8') }
        }
        return null
      }),
    )

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        files[result.value.path] = result.value.content
      }
    }

    // Small delay between batches to respect rate limits
    if (i + batchSize < items.length) {
      await new Promise(r => setTimeout(r, 100))
    }
  }

  return files
}

// Recursively fetch all files from a GitHub repo tree
async function fetchTree(owner: string, repo: string, branch: string, token: string): Promise<Record<string, string>> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers: GITHUB_HEADERS(token) },
  )

  if (!res.ok) {
    if (res.status === 404) throw new Error(`Branch "${branch}" not found. Check the repository exists and you have access.`)
    throw new Error(`Failed to fetch tree: HTTP ${res.status}`)
  }

  const data = await res.json()

  const blobs = (data.tree || []).filter((item: any) => {
    if (item.type !== 'blob') return false
    if (item.size > 500000) return false // Skip files > 500KB

    const parts = item.path.split('/')
    const basename = parts[parts.length - 1] || ''

    // Skip files in ignored directories
    if (parts.some((p: string) => SKIP_DIRS.has(p))) return false

    // Skip lock/generated files
    if (SKIP_FILES.has(basename)) return false

    // Allow known extensionless config files
    if (EXTENSIONLESS_INCLUDES.has(basename)) return true

    // Check extension
    const ext = basename.split('.').pop()?.toLowerCase() || ''
    return TEXT_EXTENSIONS.has(ext)
  })

  // Fetch up to 300 files in batches of 10
  const filesToFetch = blobs.slice(0, 300).map((b: any) => ({ path: b.path, sha: b.sha }))
  return fetchInBatches(filesToFetch, owner, repo, branch, token, 10)
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
    // Auto-detect branch if not specified
    const targetBranch = branch || await getDefaultBranch(owner, repo, session.accessToken)
    const files = await fetchTree(owner, repo, targetBranch, session.accessToken)
    return NextResponse.json({
      files,
      fileCount: Object.keys(files).length,
      branch: targetBranch,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
