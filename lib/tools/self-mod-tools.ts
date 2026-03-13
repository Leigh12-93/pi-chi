import { tool } from 'ai'
import { z } from 'zod'
import { GITHUB_TOKEN } from '@/lib/github'
import { VERCEL_TOKEN, VERCEL_TEAM } from '@/lib/vercel'
import type { ToolContext } from './types'

export function createSelfModTools(ctx: ToolContext) {
  return {
    pi_read_own_source: tool({
      description: 'Read a file from Pi-Chi\'s own source code on GitHub (repo: Leigh12-93/pi-chi). Use this to understand your own implementation before modifying it.',
      inputSchema: z.object({
        path: z.string().describe('File path in the Pi-Chi repo, e.g. "app/api/chat/route.ts" or "components/chat-panel.tsx"'),
        branch: z.string().optional().describe('Branch (default: master)'),
      }),
      execute: async ({ path, branch }) => {
        const token = GITHUB_TOKEN
        if (!token) return { error: 'No GitHub token configured' }

        const branchName = branch || 'master'
        const result = await ctx.githubFetch(
          `/repos/Leigh12-93/pi-chi/contents/${path}?ref=${branchName}`,
          token
        )
        if (result.error) return { error: result.error }

        // GitHub returns base64-encoded content
        const content = Buffer.from(result.content, 'base64').toString('utf-8')
        return { path, content, size: content.length, lines: content.split('\n').length }
      },
    }),

    pi_modify_own_source: tool({
      description: 'Modify a file in Pi-Chi\'s own source code. This pushes a commit to the Pi-Chi repo on GitHub. Use with care — you are editing your own brain. ALWAYS use a feature branch, never master.',
      inputSchema: z.object({
        path: z.string().describe('File path to modify in Pi-Chi repo'),
        content: z.string().describe('New file content (complete file)'),
        message: z.string().describe('Commit message describing the change'),
        branch: z.string().describe('Branch name (must NOT be "master" or "main" — use a feature branch)'),
      }),
      execute: async ({ path, content, message, branch }) => {
        const token = GITHUB_TOKEN
        if (!token) return { error: 'No GitHub token configured' }

        const owner = 'Leigh12-93'
        const repo = 'pi'
        const branchName = branch || 'self-modify-' + Date.now()

        // Security: hard-reject pushes to protected branches
        const PROTECTED_BRANCHES = ['master', 'main', 'production']
        if (PROTECTED_BRANCHES.includes(branchName.toLowerCase())) {
          return { error: `Direct pushes to "${branchName}" are blocked. Use a feature branch (e.g. "feat/my-change"), then pi_create_pr to merge.` }
        }

        // Security: block direct pushes to master — must use a branch
        if (branchName === 'master' || branchName === 'main') {
          return { error: 'Direct pushes to master/main are blocked. Create a branch first with pi_create_branch, push to it, then create a PR with pi_create_pr.' }
        }

        // Get current file SHA (needed for update)
        const existing = await ctx.githubFetch(`/repos/${owner}/${repo}/contents/${path}?ref=${branchName}`, token)

        const body: Record<string, string> = {
          message: `[self-modify] ${message}`,
          content: Buffer.from(content).toString('base64'),
          branch: branchName,
        }
        if (existing.sha) body.sha = existing.sha

        const result = await ctx.githubFetch(`/repos/${owner}/${repo}/contents/${path}`, token, {
          method: 'PUT',
          body: JSON.stringify(body),
        })

        if (result.error) return { error: result.error }
        return {
          ok: true,
          path,
          commitSha: result.commit?.sha,
          note: 'File updated on GitHub. Use pi_redeploy to deploy the change.',
        }
      },
    }),

    pi_redeploy: tool({
      description: 'Trigger a redeployment of Pi-Chi itself on Vercel. Call this after using pi_modify_own_source to apply your changes.',
      inputSchema: z.object({
        reason: z.string().describe('Why are you redeploying? e.g. "Added new db_query tool"'),
      }),
      execute: async ({ reason }) => {
        // Trigger Vercel deploy hook or use the Vercel API to redeploy
        const token = VERCEL_TOKEN
        if (!token) return { error: 'No Vercel deploy token configured' }

        // Create a deployment from the latest Git commit
        const teamParam = VERCEL_TEAM ? `?teamId=${VERCEL_TEAM}` : ''
        const res = await fetch(`https://api.vercel.com/v13/deployments${teamParam}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(ctx.defaultTimeout),
          body: JSON.stringify({
            name: 'pi',
            gitSource: {
              type: 'github',
              org: 'Leigh12-93',
              repo: 'pi',
              ref: 'master',
            },
          }),
        })

        const data = await res.json()
        if (!res.ok) return { error: data.error?.message || `Vercel API ${res.status}` }
        return {
          ok: true,
          url: `https://${data.url}`,
          deploymentId: data.id,
          reason,
          note: 'Pi-Chi is redeploying. Changes will be live in ~60 seconds.',
        }
      },
    }),

    pi_revert_commit: tool({
      description: 'Revert the last commit on a Pi-Chi feature branch. Use this when a self-modification breaks the build. Cannot revert on master/main — use a feature branch.',
      inputSchema: z.object({
        reason: z.string().describe('Why are you reverting?'),
        branch: z.string().describe('Branch to revert on (must be a feature branch, not master)'),
      }),
      execute: async ({ reason, branch }) => {
        const token = GITHUB_TOKEN
        if (!token) return { error: 'No GitHub token configured' }

        const owner = 'Leigh12-93'
        const repo = 'pi'

        // Security: block reverts on protected branches
        const PROTECTED_BRANCHES = ['master', 'main', 'production']
        if (PROTECTED_BRANCHES.includes(branch.toLowerCase())) {
          return { error: `Direct reverts on "${branch}" are blocked. Use a feature branch, then create a PR to merge the revert.` }
        }

        // Get the latest 2 commits to find parent
        const commits = await ctx.githubFetch(`/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=2`, token)
        if (!Array.isArray(commits) || commits.length < 2) return { error: 'Cannot revert — need at least 2 commits' }

        const headSha = commits[0].sha
        const parentSha = commits[1].sha
        const headMessage = commits[0].commit.message

        // Get the parent tree
        const parentCommit = await ctx.githubFetch(`/repos/${owner}/${repo}/git/commits/${parentSha}`, token)
        if (parentCommit.error) return { error: `Failed to get parent commit: ${parentCommit.error}` }

        // Create a new commit that points to the parent's tree (effectively reverting)
        const newCommit = await ctx.githubFetch(`/repos/${owner}/${repo}/git/commits`, token, {
          method: 'POST',
          body: JSON.stringify({
            message: `[self-revert] Revert "${headMessage}"\n\nReason: ${reason}`,
            tree: parentCommit.tree.sha,
            parents: [headSha],
          }),
        })
        if (newCommit.error) return { error: `Failed to create revert commit: ${newCommit.error}` }

        // Update branch to point to the revert commit
        const update = await ctx.githubFetch(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, token, {
          method: 'PATCH',
          body: JSON.stringify({ sha: newCommit.sha }),
        })
        if (update.error) return { error: `Failed to update ${branch}: ${update.error}` }

        return {
          ok: true,
          revertedCommit: headSha.slice(0, 7),
          revertedMessage: headMessage,
          newCommit: newCommit.sha.slice(0, 7),
          reason,
          note: 'Reverted successfully. Use pi_redeploy to deploy the revert.',
        }
      },
    }),

    pi_create_branch: tool({
      description: 'Create a new branch on the Pi-Chi repo for safe development. Use this instead of pushing directly to master.',
      inputSchema: z.object({
        branch: z.string().describe('Branch name, e.g. "feat/add-testing-tools"'),
        fromBranch: z.string().default('master').describe('Base branch to create from'),
      }),
      execute: async ({ branch, fromBranch }) => {
        const token = GITHUB_TOKEN
        if (!token) return { error: 'No GitHub token configured' }

        const owner = 'Leigh12-93'
        const repo = 'pi'

        // Get SHA of the base branch
        const ref = await ctx.githubFetch(`/repos/${owner}/${repo}/git/ref/heads/${fromBranch}`, token)
        if (ref.error) return { error: `Failed to read ${fromBranch}: ${ref.error}` }

        // Create new branch
        const result = await ctx.githubFetch(`/repos/${owner}/${repo}/git/refs`, token, {
          method: 'POST',
          body: JSON.stringify({
            ref: `refs/heads/${branch}`,
            sha: ref.object.sha,
          }),
        })
        if (result.error) return { error: `Failed to create branch: ${result.error}` }

        return {
          ok: true,
          branch,
          basedOn: fromBranch,
          sha: ref.object.sha.slice(0, 7),
          note: `Branch "${branch}" created. Use pi_modify_own_source with branch="${branch}" to push changes there instead of master.`,
        }
      },
    }),

    pi_create_pr: tool({
      description: 'Create a pull request on the Pi-Chi repo. Use after pushing changes to a feature branch.',
      inputSchema: z.object({
        title: z.string().describe('PR title'),
        body: z.string().describe('PR description'),
        head: z.string().describe('Source branch with changes'),
        base: z.string().default('master').describe('Target branch'),
      }),
      execute: async ({ title, body, head, base }) => {
        const token = GITHUB_TOKEN
        if (!token) return { error: 'No GitHub token configured' }

        const result = await ctx.githubFetch('/repos/Leigh12-93/pi-chi/pulls', token, {
          method: 'POST',
          body: JSON.stringify({ title, body, head, base }),
        })
        if (result.error) return { error: `Failed to create PR: ${result.error}` }

        return {
          ok: true,
          number: result.number,
          url: result.html_url,
          title,
          head,
          base,
        }
      },
    }),

    pi_merge_pr: tool({
      description: 'Merge a pull request on the Pi-Chi repo. Only merge after verifying the preview deploy succeeded.',
      inputSchema: z.object({
        prNumber: z.number().describe('PR number to merge'),
        method: z.enum(['merge', 'squash', 'rebase']).default('squash').describe('Merge method'),
      }),
      execute: async ({ prNumber, method }) => {
        const token = GITHUB_TOKEN
        if (!token) return { error: 'No GitHub token configured' }

        // Check CI/deploy status before merging
        const pr = await ctx.githubFetch(`/repos/Leigh12-93/pi-chi/pulls/${prNumber}`, token)
        if (pr.error) return { error: `Failed to read PR: ${pr.error}` }
        const headSha = pr.head?.sha
        if (headSha) {
          const checks = await ctx.githubFetch(`/repos/Leigh12-93/pi-chi/commits/${headSha}/check-runs`, token)
          if (Array.isArray(checks.check_runs)) {
            const failing = checks.check_runs.filter((c: any) => c.conclusion === 'failure')
            const pending = checks.check_runs.filter((c: any) => c.status !== 'completed')
            if (failing.length > 0) {
              return { error: `Cannot merge: ${failing.length} check(s) failing: ${failing.map((c: any) => c.name).join(', ')}. Fix before merging.` }
            }
            if (pending.length > 0) {
              return { error: `Cannot merge: ${pending.length} check(s) still pending: ${pending.map((c: any) => c.name).join(', ')}. Wait for completion.` }
            }
          }
        }

        const result = await ctx.githubFetch(`/repos/Leigh12-93/pi-chi/pulls/${prNumber}/merge`, token, {
          method: 'PUT',
          body: JSON.stringify({ merge_method: method }),
        })
        if (result.error) return { error: `Failed to merge PR: ${result.error}` }

        return {
          ok: true,
          merged: true,
          sha: result.sha?.slice(0, 7),
          note: 'PR merged to master. Vercel will auto-deploy. Use pi_deployment_status to monitor.',
        }
      },
    }),

    pi_check_npm_package: tool({
      description: 'Check if an npm package exists and get its latest version. ALWAYS call this before adding a new dependency to package.json.',
      inputSchema: z.object({
        name: z.string().describe('npm package name, e.g. "@modelcontextprotocol/sdk"'),
      }),
      execute: async ({ name }) => {
        try {
          const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(ctx.defaultTimeout),
          })
          if (res.status === 404) return { exists: false, name, error: `Package "${name}" does NOT exist on npm. Do not add it to package.json.` }
          if (!res.ok) return { error: `npm registry returned ${res.status}` }
          const data = await res.json()
          const latest = data['dist-tags']?.latest
          const description = data.description || ''
          const deps = Object.keys(data.versions?.[latest]?.dependencies || {}).length
          return { exists: true, name, latest, description, dependencyCount: deps }
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Failed to check npm' }
        }
      },
    }),

    pi_list_branches: tool({
      description: 'List all branches on the Pi-Chi repo. Useful to see what feature branches exist.',
      inputSchema: z.object({}),
      execute: async () => {
        const token = GITHUB_TOKEN
        if (!token) return { error: 'No GitHub token configured' }
        const result = await ctx.githubFetch('/repos/Leigh12-93/pi-chi/branches?per_page=30', token)
        if (!Array.isArray(result)) return { error: result.error || 'Failed to list branches' }
        return {
          branches: result.map((b: any) => ({
            name: b.name,
            sha: b.commit.sha.slice(0, 7),
            protected: b.protected,
          })),
        }
      },
    }),

    pi_delete_branch: tool({
      description: 'Delete a branch on the Pi-Chi repo after it has been merged.',
      inputSchema: z.object({
        branch: z.string().describe('Branch name to delete (cannot be master)'),
      }),
      execute: async ({ branch }) => {
        const PROTECTED_BRANCHES = ['master', 'main', 'production']
        if (PROTECTED_BRANCHES.includes(branch.toLowerCase())) return { error: 'Cannot delete protected branches (master/main/production)' }
        const token = GITHUB_TOKEN
        if (!token) return { error: 'No GitHub token configured' }
        const result = await ctx.githubFetch(`/repos/Leigh12-93/pi-chi/git/refs/heads/${branch}`, token, {
          method: 'DELETE',
        })
        if (result.error) return { error: `Failed to delete branch: ${result.error}` }
        return { ok: true, deleted: branch }
      },
    }),
  }
}
