import { tool } from 'ai'
import { z } from 'zod'
import { GITHUB_API } from '@/lib/github'
import { batchParallel } from '@/lib/github'
import { TaskStore } from '@/lib/background-tasks'
import type { ToolContext } from './types'

/** Text file extensions that can be pulled from GitHub */
export const PULLABLE_TEXT_EXTS = new Set(['ts','tsx','js','jsx','json','css','scss','html','md','mdx','txt','yaml','yml','toml','sql','sh','py','rb','go','rs','java','kt','swift','c','cpp','h','xml','svg','graphql','gql','prisma'])
/** Directories to skip when pulling from GitHub */
export const SKIP_DIRS = new Set(['node_modules','.git','.next','dist','build','.vercel','.turbo','coverage','__pycache__','.cache'])
/** Special filenames to always include (even without extension) */
export const ALWAYS_INCLUDE = ['Dockerfile','Makefile','.gitignore','.env.example']

export function createGithubTools(ctx: ToolContext) {
  return {
    github_create_repo: tool({
      description: 'Create a new GitHub repository and push all project files to it. Returns a taskId — use check_task_status to poll for completion.',
      inputSchema: z.object({
        repoName: z.string().describe('Repository name'),
        isPublic: z.boolean().optional().describe('Make repo public (default: private)'),
        description: z.string().optional().describe('Repository description'),
      }),
      execute: async ({ repoName, isPublic, description }) => {
        const token = ctx.effectiveGithubToken
        if (!token) return { error: 'Not authenticated. Sign in with GitHub.' }

        const files = ctx.vfs.toRecord()
        if (Object.keys(files).length === 0) return { error: 'No files to push.' }

        const createResult = await TaskStore.createPersistent(
          ctx.supabaseFetch,
          ctx.projectId,
          'github_create',
          async (_onProgress) => {
            const repo = await ctx.githubFetch('/user/repos', token, {
              method: 'POST',
              body: JSON.stringify({
                name: repoName,
                description: description || `Built with Forge`,
                private: !isPublic,
                auto_init: true,
              }),
            })
            if (repo.error) {
              if (repo.status === 422) throw new Error(`Repository "${repoName}" already exists. Choose a different name.`)
              throw new Error(`Failed to create repo: ${repo.error}`)
            }

            const owner = repo.owner.login
            await new Promise(resolve => setTimeout(resolve, 2000))

            // Retry getting initial ref (GitHub can be slow)
            let ref: any
            for (let attempt = 0; attempt < 3; attempt++) {
              ref = await ctx.githubFetch(`/repos/${owner}/${repoName}/git/refs/heads/main`, token)
              if (!ref.error) break
              await new Promise(resolve => setTimeout(resolve, 1500))
            }
            if (ref.error) throw new Error(`Repo created but failed to get initial ref: ${ref.error}`)
            const parentSha = ref.object.sha

            // Upload blobs in parallel batches of 5
            const fileEntries = Object.entries(files)
            const blobs = await batchParallel(fileEntries, 5, async ([path, content]) => {
              const blob = await ctx.githubFetch(`/repos/${owner}/${repoName}/git/blobs`, token, {
                method: 'POST',
                body: JSON.stringify({ content, encoding: 'utf-8' }),
              })
              if (blob.error) throw new Error(`Failed to create blob for ${path}: ${blob.error}`)
              return { path, mode: '100644' as const, type: 'blob' as const, sha: blob.sha as string }
            })

            const tree = await ctx.githubFetch(`/repos/${owner}/${repoName}/git/trees`, token, {
              method: 'POST',
              body: JSON.stringify({ base_tree: parentSha, tree: blobs }),
            })
            if (tree.error) throw new Error(`Failed to create tree: ${tree.error}`)

            const commit = await ctx.githubFetch(`/repos/${owner}/${repoName}/git/commits`, token, {
              method: 'POST',
              body: JSON.stringify({ message: 'Initial commit from Forge', tree: tree.sha, parents: [parentSha] }),
            })
            if (commit.error) throw new Error(`Failed to create commit: ${commit.error}`)

            const updateRef = await ctx.githubFetch(`/repos/${owner}/${repoName}/git/refs/heads/main`, token, {
              method: 'PATCH',
              body: JSON.stringify({ sha: commit.sha }),
            })
            if (updateRef.error) throw new Error(`Failed to update branch ref: ${updateRef.error}`)

            return {
              ok: true,
              url: repo.html_url,
              owner,
              repoName,
              commitSha: commit.sha,
              filesCount: Object.keys(files).length,
            }
          },
        )
        if (!createResult.ok) return { error: createResult.error }
        return { taskId: createResult.taskId, status: 'running', message: `Creating repo and pushing ${Object.keys(files).length} files. Use check_task_status to monitor.` }
      },
    }),

    github_push_update: tool({
      description: 'Push changed files to an existing GitHub repository. Only pushes files that were modified locally (not all project files). Returns a taskId — use check_task_status to poll for completion.',
      inputSchema: z.object({
        owner: z.string().describe('GitHub username/org'),
        repo: z.string().describe('Repository name'),
        message: z.string().describe('Commit message'),
        branch: z.string().optional().describe('Branch name (default: main, falls back to master)'),
        pushAll: z.boolean().optional().describe('Push ALL files instead of just changed ones. Only use for initial push or full sync. Default: false.'),
      }),
      execute: async ({ owner, repo, message, branch, pushAll }) => {
        const token = ctx.effectiveGithubToken
        if (!token) return { error: 'Not authenticated. Sign in with GitHub.' }
        const branchName = branch || 'main'

        // Determine which files to push
        const changedFiles = ctx.vfs.getChangedFiles()
        const deletedPaths = ctx.vfs.getDeletedPaths()
        const hasChanges = Object.keys(changedFiles).length > 0 || deletedPaths.length > 0
        const files = (pushAll || !hasChanges) ? ctx.vfs.toRecord() : changedFiles
        const mode = (pushAll || !hasChanges) ? 'full' : 'incremental'

        if (Object.keys(files).length === 0 && deletedPaths.length === 0) {
          return { error: 'No files to push. No local changes detected.' }
        }

        const pushResult = await TaskStore.createPersistent(
          ctx.supabaseFetch,
          ctx.projectId,
          'github_push',
          async (_onProgress) => {
            // Try specified branch, fall back to main/master
            let ref = await ctx.githubFetch(`/repos/${owner}/${repo}/git/refs/heads/${branchName}`, token)
            if (ref.error && branchName === 'main') {
              ref = await ctx.githubFetch(`/repos/${owner}/${repo}/git/refs/heads/master`, token)
            }
            if (ref.error) throw new Error(`Failed to get branch "${branchName}": ${ref.error}`)
            const parentSha = ref.object.sha

            // Upload blobs in parallel batches of 5
            const fileEntries = Object.entries(files)
            const blobs = await batchParallel(fileEntries, 5, async ([path, content]) => {
              const blob = await ctx.githubFetch(`/repos/${owner}/${repo}/git/blobs`, token, {
                method: 'POST',
                body: JSON.stringify({ content, encoding: 'utf-8' }),
              })
              if (blob.error) throw new Error(`Failed to create blob for ${path}: ${blob.error}`)
              return { path, mode: '100644' as const, type: 'blob' as const, sha: blob.sha as string }
            })

            // For incremental mode, include deletions as well
            const treeEntries = [...blobs]
            if (mode === 'incremental' && deletedPaths.length > 0) {
              for (const dp of deletedPaths) {
                treeEntries.push({ path: dp, mode: '100644' as const, type: 'blob' as const, sha: null as any }) // null SHA = delete
              }
            }

            const tree = await ctx.githubFetch(`/repos/${owner}/${repo}/git/trees`, token, {
              method: 'POST',
              body: JSON.stringify({ base_tree: parentSha, tree: treeEntries }),
            })
            if (tree.error) throw new Error(`Failed to create tree: ${tree.error}`)

            const commit = await ctx.githubFetch(`/repos/${owner}/${repo}/git/commits`, token, {
              method: 'POST',
              body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] }),
            })
            if (commit.error) throw new Error(`Failed to commit: ${commit.error}`)

            const update = await ctx.githubFetch(`/repos/${owner}/${repo}/git/refs/heads/${branchName}`, token, {
              method: 'PATCH',
              body: JSON.stringify({ sha: commit.sha }),
            })
            if (update.error) throw new Error(`Failed to update ref: ${update.error}`)

            // Clear dirty state after successful push
            ctx.vfs.clearDirty()

            return {
              ok: true,
              commitSha: commit.sha,
              mode,
              filesCount: Object.keys(files).length,
              ...(deletedPaths.length > 0 ? { deletedCount: deletedPaths.length } : {}),
              repoUrl: `https://github.com/${owner}/${repo}`,
              commitUrl: `https://github.com/${owner}/${repo}/commit/${commit.sha}`,
            }
          },
        )
        if (!pushResult.ok) return { error: pushResult.error }
        return { taskId: pushResult.taskId, status: 'running', message: `Pushing ${Object.keys(files).length} changed file(s) to ${owner}/${repo} (${mode} mode). Use check_task_status to monitor.` }
      },
    }),

    github_push_files: tool({
      description: 'Push specific named files to a GitHub repository. Faster than github_push_update for targeted changes (avoids rate limits).',
      inputSchema: z.object({
        owner: z.string().describe('GitHub username/org'),
        repo: z.string().describe('Repository name'),
        paths: z.array(z.string()).describe('List of file paths to push'),
        message: z.string().describe('Commit message'),
        branch: z.string().optional().describe('Branch name (default: main)'),
      }),
      execute: async ({ owner, repo, paths, message, branch }) => {
        const token = ctx.effectiveGithubToken
        if (!token) return { error: 'Not authenticated. Sign in with GitHub.' }
        const branchName = branch || 'main'

        // Collect file contents from VFS
        const filesToPush: Record<string, string> = {}
        const missing: string[] = []
        for (const p of paths) {
          const content = ctx.vfs.read(p)
          if (content !== undefined) {
            filesToPush[p] = content
          } else {
            missing.push(p)
          }
        }
        if (Object.keys(filesToPush).length === 0) {
          return { error: `None of the specified files exist in the project: ${missing.join(', ')}` }
        }

        // Direct push (no background task needed for small file counts)
        try {
          let ref = await ctx.githubFetch(`/repos/${owner}/${repo}/git/refs/heads/${branchName}`, token)
          if (ref.error && branchName === 'main') {
            ref = await ctx.githubFetch(`/repos/${owner}/${repo}/git/refs/heads/master`, token)
          }
          if (ref.error) return { error: `Failed to get branch "${branchName}": ${ref.error}` }
          const parentSha = ref.object.sha

          const fileEntries = Object.entries(filesToPush)
          const blobs = await batchParallel(fileEntries, 5, async ([path, content]) => {
            const blob = await ctx.githubFetch(`/repos/${owner}/${repo}/git/blobs`, token, {
              method: 'POST',
              body: JSON.stringify({ content, encoding: 'utf-8' }),
            })
            if (blob.error) throw new Error(`Failed to create blob for ${path}: ${blob.error}`)
            return { path, mode: '100644' as const, type: 'blob' as const, sha: blob.sha as string }
          })

          const tree = await ctx.githubFetch(`/repos/${owner}/${repo}/git/trees`, token, {
            method: 'POST',
            body: JSON.stringify({ base_tree: parentSha, tree: blobs }),
          })
          if (tree.error) return { error: `Failed to create tree: ${tree.error}` }

          const commit = await ctx.githubFetch(`/repos/${owner}/${repo}/git/commits`, token, {
            method: 'POST',
            body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] }),
          })
          if (commit.error) return { error: `Failed to commit: ${commit.error}` }

          const update = await ctx.githubFetch(`/repos/${owner}/${repo}/git/refs/heads/${branchName}`, token, {
            method: 'PATCH',
            body: JSON.stringify({ sha: commit.sha }),
          })
          if (update.error) return { error: `Failed to update ref: ${update.error}` }

          return {
            ok: true,
            commitSha: commit.sha,
            filesCount: Object.keys(filesToPush).length,
            files: Object.keys(filesToPush),
            ...(missing.length > 0 ? { skipped: missing } : {}),
            commitUrl: `https://github.com/${owner}/${repo}/commit/${commit.sha}`,
          }
        } catch (err: any) {
          return { error: err.message || 'Push failed' }
        }
      },
    }),

    github_read_file: tool({
      description: 'Read a file from any GitHub repository you have access to. Use to inspect code in other projects like AussieSMS.',
      inputSchema: z.object({
        owner: z.string().describe('GitHub username/org, e.g. "Leigh12-93"'),
        repo: z.string().describe('Repository name'),
        path: z.string().describe('File path in the repo'),
        branch: z.string().optional().describe('Branch (default: main)'),
      }),
      execute: async ({ owner, repo, path, branch }) => {
        const token = ctx.effectiveGithubToken
        if (!token) return { error: 'Not authenticated. Sign in with GitHub.' }

        const branchName = branch || 'main'
        const result = await ctx.githubFetch(
          `/repos/${owner}/${repo}/contents/${path}?ref=${branchName}`,
          token
        )
        if (result.error) return { error: result.error }

        if (Array.isArray(result)) {
          // GitHub returns an array for directory listings
          const entries = result.map((e: any) => ({
            name: e.name,
            type: e.type,
            path: e.path,
            size: e.size,
          }))
          return { type: 'directory', entries, path }
        }

        const content = Buffer.from(result.content, 'base64').toString('utf-8')
        return { path, content, size: content.length, lines: content.split('\n').length }
      },
    }),

    github_list_repo_files: tool({
      description: 'List files in a GitHub repository directory. Use to explore codebases.',
      inputSchema: z.object({
        owner: z.string().describe('GitHub username/org'),
        repo: z.string().describe('Repository name'),
        path: z.string().optional().describe('Directory path (default: root)'),
        branch: z.string().optional().describe('Branch (default: main)'),
      }),
      execute: async ({ owner, repo, path, branch }) => {
        const token = ctx.effectiveGithubToken
        if (!token) return { error: 'Not authenticated. Sign in with GitHub.' }

        const branchName = branch || 'main'
        const dirPath = path || ''
        const result = await ctx.githubFetch(
          `/repos/${owner}/${repo}/contents/${dirPath}?ref=${branchName}`,
          token
        )
        if (result.error) return { error: result.error }

        if (Array.isArray(result)) {
          const entries = result.map((e: any) => ({
            name: e.name,
            type: e.type,
            path: e.path,
            size: e.size,
          }))
          return { entries, count: entries.length }
        }
        return { error: 'Path is a file, not a directory. Use github_read_file instead.' }
      },
    }),

    github_modify_external_file: tool({
      description: 'Modify a file in any GitHub repository you have access to. Pushes a commit directly.',
      inputSchema: z.object({
        owner: z.string().describe('GitHub username/org'),
        repo: z.string().describe('Repository name'),
        path: z.string().describe('File path to modify'),
        content: z.string().describe('New file content'),
        message: z.string().describe('Commit message'),
        branch: z.string().optional().describe('Branch (default: main)'),
      }),
      execute: async ({ owner, repo, path, content, message, branch }) => {
        const token = ctx.effectiveGithubToken
        if (!token) return { error: 'Not authenticated. Sign in with GitHub.' }

        // Size validation
        if (content.length > 500_000) {
          return { error: `File too large (${Math.round(content.length / 1024)}KB). Maximum is 500KB.` }
        }

        const branchName = branch || 'main'

        // Get current file SHA
        const existing = await ctx.githubFetch(`/repos/${owner}/${repo}/contents/${path}?ref=${branchName}`, token)

        const body: Record<string, string> = {
          message,
          content: Buffer.from(content).toString('base64'),
          branch: branchName,
        }
        if (existing.sha) body.sha = existing.sha

        const result = await ctx.githubFetch(`/repos/${owner}/${repo}/contents/${path}`, token, {
          method: 'PUT',
          body: JSON.stringify(body),
        })

        if (result.error) return { error: result.error }
        return { ok: true, path, commitSha: result.commit?.sha }
      },
    }),

    github_pull_latest: tool({
      description: 'Pull the latest files from a GitHub repo into the current project. By default, locally-edited files are preserved (not overwritten). Use force=true to overwrite everything.',
      inputSchema: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        branch: z.string().optional().describe('Branch to pull from (auto-detects default if omitted)'),
        force: z.boolean().optional().describe('If true, overwrite ALL files including locally-edited ones. Default: false (preserves local edits).'),
      }),
      execute: async ({ owner, repo, branch, force }) => {
        const token = ctx.effectiveGithubToken
        if (!token) return { error: 'Not authenticated. Sign in with GitHub.' }

        // Auto-detect default branch if not specified
        let targetBranch = branch
        if (!targetBranch) {
          try {
            const repoRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
              headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
              signal: AbortSignal.timeout(ctx.defaultTimeout),
            })
            if (repoRes.ok) {
              const repoData = await repoRes.json()
              targetBranch = repoData.default_branch || 'main'
            } else {
              targetBranch = 'main'
            }
          } catch {
            targetBranch = 'main'
          }
        }

        // Get the tree recursively
        const treeRes = await fetch(
          `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${targetBranch}?recursive=1`,
          { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' }, signal: AbortSignal.timeout(ctx.defaultTimeout) }
        )
        if (!treeRes.ok) return { error: `Failed to fetch tree: ${treeRes.status}` }
        const treeData = await treeRes.json()

        const textExts = PULLABLE_TEXT_EXTS
        const skipDirs = SKIP_DIRS

        const blobs = (treeData.tree || []).filter((item: any) => {
          if (item.type !== 'blob' || item.size > 500000) return false
          const parts = item.path.split('/')
          if (parts.some((p: string) => skipDirs.has(p))) return false
          const ext = item.path.split('.').pop()?.toLowerCase() || ''
          const basename = item.path.split('/').pop() || ''
          if (ALWAYS_INCLUDE.includes(basename)) return true
          return textExts.has(ext)
        }).slice(0, 300)

        // Fetch in batches of 10 to avoid GitHub rate limits
        const results: PromiseSettledResult<{ path: string; content: string } | null>[] = []
        for (let i = 0; i < blobs.length; i += 10) {
          const batch = blobs.slice(i, i + 10)
          const batchResults = await Promise.allSettled(
            batch.map(async (item: any) => {
              const res = await fetch(
                `${GITHUB_API}/repos/${owner}/${repo}/git/blobs/${item.sha}`,
                { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' }, signal: AbortSignal.timeout(ctx.defaultTimeout) }
              )
              if (!res.ok) return null
              const data = await res.json()
              if (data.encoding === 'base64' && data.content) {
                return { path: item.path, content: Buffer.from(data.content, 'base64').toString('utf-8') }
              }
              return null
            })
          )
          results.push(...batchResults)
          if (i + 10 < blobs.length) await new Promise(r => setTimeout(r, 100))
        }

        const pulledFiles: string[] = []
        const skippedDirty: string[] = []
        let failedCount = 0
        for (const r of results) {
          if (r.status === 'rejected' || (r.status === 'fulfilled' && !r.value)) {
            failedCount++
            continue
          }
          if (r.status === 'fulfilled' && r.value) {
            const { path: filePath, content } = r.value
            // Protect locally-edited files unless force=true
            if (!force && ctx.vfs.isDirty(filePath)) {
              skippedDirty.push(filePath)
              continue
            }
            // Use writeClean so pulled files update the baseline without marking dirty
            ctx.vfs.writeClean(filePath, content)
            pulledFiles.push(filePath)
          }
        }

        if (failedCount > 0 && failedCount > blobs.length * 0.3) {
          return { error: `Too many files failed to download (${failedCount}/${blobs.length}). Check repository access and try again.` }
        }

        return {
          ok: true,
          fileCount: pulledFiles.length,
          files: pulledFiles,
          ...(skippedDirty.length > 0 ? { skippedDirty, skippedCount: skippedDirty.length, note: `${skippedDirty.length} locally-edited file(s) were preserved. Use force=true to overwrite them.` } : {}),
          ...(failedCount > 0 ? { failedCount } : {}),
        }
      },
    }),

    github_search_code: tool({
      description: 'Search for code across GitHub repositories. Find files, functions, patterns.',
      inputSchema: z.object({
        query: z.string().describe('Search query. Supports GitHub code search syntax.'),
        repo: z.string().optional().describe('Restrict to a specific repo, e.g. "Leigh12-93/forge"'),
      }),
      execute: async ({ query, repo }) => {
        const token = ctx.effectiveGithubToken
        if (!token) return { error: 'Not authenticated. Sign in with GitHub.' }

        const q = repo ? `${query} repo:${repo}` : query
        const result = await ctx.githubFetch(
          `/search/code?q=${encodeURIComponent(q)}&per_page=10`,
          token
        )
        if (result.error) return { error: result.error }

        const items = (result.items || []).map((item: any) => ({
          name: item.name,
          path: item.path,
          repo: item.repository?.full_name,
          url: item.html_url,
        }))
        return { results: items, total: result.total_count }
      },
    }),
  }
}
