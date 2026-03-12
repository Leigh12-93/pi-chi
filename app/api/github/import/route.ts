import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { VirtualFS } from '@/lib/virtual-fs'
import { logger } from '@/lib/logger'

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
  if (res.status === 401 || res.status === 403) {
    throw new Error(`GitHub authentication failed (${res.status}). Check your access token has repo permissions.`)
  }
  if (res.status === 404) {
    throw new Error(`Repository "${owner}/${repo}" not found. Check the name and your access permissions.`)
  }
  if (res.status >= 500) {
    throw new Error(`GitHub server error (${res.status}). Try again later.`)
  }
  if (!res.ok) {
    console.warn(`[github-import] Unexpected status ${res.status} fetching default branch for ${owner}/${repo}, falling back to 'main'`)
    return 'main'
  }
  const data = await res.json()
  return data.default_branch || 'main'
}

/** Fetch a single blob with retry (up to 2 retries with backoff) */
async function fetchBlobWithRetry(
  owner: string,
  repo: string,
  item: { path: string; sha: string },
  token: string,
  maxRetries: number = 2,
): Promise<{ path: string; content: string } | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/blobs/${item.sha}`,
        { headers: GITHUB_HEADERS(token), signal: AbortSignal.timeout(15000) },
      )
      if (res.status === 403 || res.status === 429) {
        // Rate limited — wait and retry
        // Cap retry delay at 30s to prevent GitHub returning huge Retry-After values (e.g. 300s)
        const retryAfter = Math.min(parseInt(res.headers.get('retry-after') || '5', 10), 30)
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, retryAfter * 1000))
          continue
        }
        return null
      }
      if (!res.ok) return null
      const data = await res.json()
      if (data.encoding === 'base64' && data.content) {
        return { path: item.path, content: Buffer.from(data.content, 'base64').toString('utf-8') }
      }
      return null
    } catch { /* retry: transient GitHub API failures */
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
        continue
      }
      return null
    }
  }
  return null
}

/** Fetch file contents in batches to avoid GitHub rate limits */
async function fetchInBatches(
  items: { path: string; sha: string }[],
  owner: string,
  repo: string,
  _branch: string,
  token: string,
  batchSize: number = 10,
): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  let totalBytes = 0
  const MAX_IMPORT_BYTES = 50 * 1024 * 1024 // 50MB

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const results = await Promise.allSettled(
      batch.map((item) => fetchBlobWithRetry(owner, repo, item, token)),
    )

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        totalBytes += result.value.content.length
        if (totalBytes > MAX_IMPORT_BYTES) {
          throw new Error('Repository too large (>50MB). Try importing a specific branch or subdirectory.')
        }
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
async function fetchTree(owner: string, repo: string, branch: string, token: string): Promise<{ files: Record<string, string>; skipped: string[]; failedFiles: string[]; truncated: boolean }> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers: GITHUB_HEADERS(token) },
  )

  if (!res.ok) {
    if (res.status === 404) throw new Error(`Branch "${branch}" not found. Check the repository exists and you have access.`)
    throw new Error(`Failed to fetch tree: HTTP ${res.status}`)
  }

  const data = await res.json()

  const truncated = !!data.truncated
  if (truncated) {
    console.warn(`[github-import] Tree truncated for ${owner}/${repo} — some files may be missing`)
  }

  const skipped: string[] = []
  const blobs = (data.tree || []).filter((item: any) => {
    if (item.type !== 'blob') return false
    if (item.size > 500000) {
      skipped.push(`${item.path} (${Math.round(item.size / 1024)}KB — too large)`)
      return false
    }

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
    if (!TEXT_EXTENSIONS.has(ext)) {
      // Only report non-directory, non-obvious binary files
      if (!basename.match(/\.(png|jpg|jpeg|gif|ico|woff2?|ttf|eot|mp[34]|wav|zip|tar|gz|pdf|webp|avif|svg)$/i)) {
        skipped.push(`${item.path} (unsupported type)`)
      }
      return false
    }
    return true
  })

  // Fetch up to 300 files in batches of 10
  if (blobs.length > 300) skipped.push(`...and ${blobs.length - 300} more files (cap: 300)`)
  const filesToFetch = blobs.slice(0, 300).map((b: any) => ({ path: b.path, sha: b.sha }))
  const files = await fetchInBatches(filesToFetch, owner, repo, branch, token, 10)

  // Track files that were requested but not returned (fetch failures)
  const failedFiles: string[] = []
  for (const item of filesToFetch) {
    if (!(item.path in files)) {
      failedFiles.push(item.path)
    }
  }

  return { files, skipped, failedFiles, truncated }
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch (err) {
    logger.warn('GitHub import JSON parse failed', { route: 'github/import', error: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
  }
  const { owner, repo, branch } = body

  if (!owner || !repo) {
    return NextResponse.json({ error: 'owner and repo required' }, { status: 400 })
  }

  try {
    // Auto-detect branch if not specified
    const targetBranch = branch || await getDefaultBranch(owner, repo, session.accessToken)

    // Global timeout: abort entire import after 2 minutes to prevent hanging
    const importResult = await Promise.race([
      fetchTree(owner, repo, targetBranch, session.accessToken),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Import timed out. For large repositories, try importing a specific branch or use a smaller repo.')), 2 * 60 * 1000)
      ),
    ])

    // Sanitize all paths before returning to client
    const sanitizedFiles: Record<string, string> = {}
    for (const [path, content] of Object.entries(importResult.files)) {
      const safePath = VirtualFS.sanitizePath(path)
      if (safePath) {
        sanitizedFiles[safePath] = content
      }
    }

    const response: any = {
      files: sanitizedFiles,
      fileCount: Object.keys(sanitizedFiles).length,
      branch: targetBranch,
      skipped: importResult.skipped,
    }
    if (importResult.failedFiles.length > 0) {
      response.failedFiles = importResult.failedFiles
    }
    if (importResult.truncated) {
      response.truncated = true
      response.warning = 'Repository file tree was truncated by GitHub. Some files may be missing.'
    }
    return NextResponse.json(response)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('GitHub import failed', { route: 'github/import', error: msg, owner: body?.owner, repo: body?.repo })
    if (msg?.includes('timed out')) {
      return NextResponse.json({ error: 'Import timed out. For large repositories, try importing a specific branch or use a smaller repo.' }, { status: 504 })
    }
    if (msg?.includes('too large')) {
      return NextResponse.json({ error: 'Repository too large (>50MB). Try importing a specific branch or subdirectory.' }, { status: 413 })
    }
    if (msg?.includes('not found') || msg?.includes('authentication failed')) {
      return NextResponse.json({ error: msg }, { status: 404 })
    }
    return NextResponse.json({ error: 'Import failed' }, { status: 500 })
  }
}
