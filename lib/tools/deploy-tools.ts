import { tool } from 'ai'
import { z } from 'zod'
import { VERCEL_TOKEN, VERCEL_TEAM, detectFramework, vercelDeploy } from '@/lib/vercel'
import { TaskStore } from '@/lib/background-tasks'
import { createV0Sandbox, getV0SandboxStatus, destroyV0Sandbox } from '@/lib/v0-sandbox'
import type { ToolContext } from './types'

export function createDeployTools(ctx: ToolContext) {
  return {
    deploy_to_vercel: tool({
      description: 'Deploy the current project files to Vercel. Returns a taskId — use check_task_status to poll for completion. Build errors are automatically captured.',
      parameters: z.object({
        framework: z.enum(['nextjs', 'vite', 'nuxtjs', 'astro', 'sveltekit', 'remix', 'static']).optional().describe('Framework hint (auto-detected if omitted)'),
      }),
      execute: async ({ framework }) => {
        const files = ctx.vfs.toRecord()
        if (Object.keys(files).length === 0) return { error: 'No files to deploy.' }

        // Pre-deploy validation: catch obvious issues before wasting a Vercel build
        const pkgJson = files['package.json']
        if (pkgJson) {
          try {
            const pkg = JSON.parse(pkgJson)
            if (!pkg.scripts?.build) return { error: 'package.json exists but has no "scripts.build". Add a build script before deploying.' }
          } catch { return { error: 'package.json is invalid JSON. Fix it before deploying.' } }
        } else if (!files['index.html']) {
          return { error: 'No package.json or index.html found. Create a project with create_project first.' }
        }

        const fw = framework === 'static' ? undefined : (framework || detectFramework(files))

        const deployResult = await TaskStore.createPersistent(
          ctx.supabaseFetch,
          ctx.projectId,
          'deploy',
          (onProgress) => vercelDeploy(ctx.projectName, files, fw, onProgress, Object.keys(ctx.clientEnvVars).length > 0 ? ctx.clientEnvVars : undefined),
        )
        if (!deployResult.ok) return { error: deployResult.error }
        const envNote = Object.keys(ctx.clientEnvVars).length > 0 ? ` with ${Object.keys(ctx.clientEnvVars).length} env vars` : ''
        return { taskId: deployResult.taskId, status: 'running', message: `Deploying ${Object.keys(files).length} files${fw ? ` (${fw})` : ''}${envNote}. Use check_task_status to monitor progress.` }
      },
    }),

    check_task_status: tool({
      description: 'Check the status of a background task (deploy, GitHub push, build check). Use this to poll for completion after a tool returns a taskId.',
      parameters: z.object({
        taskId: z.string().describe('Task ID returned by deploy_to_vercel, github_create_repo, github_push_update, or forge_check_build'),
      }),
      execute: async ({ taskId }) => {
        // Check in-request store first
        const inReq = ctx.taskStore.check(taskId)
        if (inReq) return inReq

        // Check persistent Supabase store
        const persistent = await TaskStore.checkPersistent(ctx.supabaseFetch, taskId)
        if (persistent) return persistent

        return { error: 'Task not found' }
      },
    }),

    cancel_task: tool({
      description: 'Cancel a running background task. Aborts the operation and marks it as failed with "Cancelled by user".',
      parameters: z.object({
        taskId: z.string().describe('Task ID to cancel'),
      }),
      execute: async ({ taskId }) => {
        const result = await TaskStore.cancelPersistent(ctx.supabaseFetch, taskId)
        if (!result.ok) return { error: result.error }
        return { ok: true, taskId }
      },
    }),

    forge_check_build: tool({
      description: 'Trigger a preview (non-production) deployment on Vercel to check if the current code builds successfully. Returns a taskId — use check_task_status to poll for completion. Use this BEFORE forge_redeploy to catch errors.',
      parameters: z.object({
        branch: z.string().default('master').describe('Branch to build'),
      }),
      execute: async ({ branch }) => {
        const token = VERCEL_TOKEN
        if (!token) return { error: 'No Vercel deploy token configured' }

        const buildResult = await TaskStore.createPersistent(
          ctx.supabaseFetch,
          ctx.projectId,
          'check_build',
          async (_onProgress) => {
            const teamParam = VERCEL_TEAM ? `?teamId=${VERCEL_TEAM}` : ''
            const res = await fetch(`https://api.vercel.com/v13/deployments${teamParam}`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              signal: AbortSignal.timeout(ctx.defaultTimeout),
              body: JSON.stringify({
                name: 'forge',
                target: 'preview',
                gitSource: {
                  type: 'github',
                  org: 'Leigh12-93',
                  repo: 'forge',
                  ref: branch,
                },
              }),
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error?.message || `Vercel API ${res.status}`)

            const deployId = data.id
            const previewUrl = `https://${data.url}`
            let state = data.readyState || 'QUEUED'
            let attempts = 0

            while (['QUEUED', 'BUILDING', 'INITIALIZING'].includes(state) && attempts < 24) {
              await new Promise(r => setTimeout(r, 5000))
              attempts++
              try {
                const check = await fetch(`https://api.vercel.com/v13/deployments/${deployId}${teamParam}`, {
                  headers: { Authorization: `Bearer ${token}` },
                  signal: AbortSignal.timeout(ctx.defaultTimeout),
                })
                if (check.ok) {
                  const checkData = await check.json()
                  state = checkData.readyState || state
                  if (state === 'ERROR' || state === 'CANCELED') {
                    let errorLog = ''
                    try {
                      const logsRes = await fetch(`https://api.vercel.com/v2/deployments/${deployId}/events${teamParam}`, {
                        headers: { Authorization: `Bearer ${token}` },
                        signal: AbortSignal.timeout(ctx.defaultTimeout),
                      })
                      if (logsRes.ok) {
                        const events = await logsRes.json()
                        const errors = (Array.isArray(events) ? events : [])
                          .filter((e: any) => {
                            if (e.type === 'error') return true
                            const text = e.payload?.text || ''
                            return text.match(/error|Error|failed|FAIL|Module not found|Cannot find|SyntaxError|TypeError/)
                          })
                          .map((e: any) => e.payload?.text || e.text || '')
                          .filter(Boolean)
                          .slice(-30)
                        errorLog = errors.join('\n')
                      }
                    } catch { /* ignore */ }
                    return {
                      ok: false,
                      state: 'ERROR',
                      previewUrl,
                      deployId,
                      buildFailed: true,
                      errors: errorLog || 'Build failed — check Vercel dashboard for details',
                      note: 'DO NOT deploy to production. Fix the errors first. Use forge_read_deploy_log for full output.',
                    }
                  }
                }
              } catch {
                // network error — keep polling
              }
            }

            return {
              ok: state === 'READY',
              state,
              previewUrl,
              deployId,
              buildFailed: state === 'ERROR',
              note: state === 'READY'
                ? 'Preview build succeeded! Safe to deploy to production with forge_redeploy.'
                : state === 'ERROR'
                  ? 'Build FAILED. Fix errors before deploying.'
                  : `Build still in progress after ${attempts * 5}s (state: ${state}). Check forge_deployment_status later.`,
            }
          },
        )
        if (!buildResult.ok) return { error: buildResult.error }
        return { taskId: buildResult.taskId, status: 'running', message: 'Preview build started. Use check_task_status to monitor progress (may take 60-90 seconds).' }
      },
    }),

    forge_deployment_status: tool({
      description: 'Check the current Vercel deployment status for Forge. Use after self-modification to verify the deploy succeeded.',
      parameters: z.object({}),
      execute: async () => {
        const token = VERCEL_TOKEN
        if (!token) return { error: 'No Vercel deploy token configured' }

        const teamParam = VERCEL_TEAM ? `?teamId=${VERCEL_TEAM}` : ''
        const res = await fetch(`https://api.vercel.com/v6/deployments${teamParam}&limit=3&projectId=forge`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(ctx.defaultTimeout),
        })
        if (!res.ok) {
          // Try alternative: list by name
          const res2 = await fetch(`https://api.vercel.com/v6/deployments${teamParam ? teamParam + '&' : '?'}limit=3`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(ctx.defaultTimeout),
          })
          if (!res2.ok) return { error: `Vercel API ${res2.status}` }
          const data2 = await res2.json()
          const forgeDeployments = (data2.deployments || [])
            .filter((d: any) => d.name === 'forge')
            .slice(0, 3)
          if (forgeDeployments.length === 0) return { error: 'No Forge deployments found' }
          return {
            deployments: forgeDeployments.map((d: any) => ({
              id: d.uid,
              url: `https://${d.url}`,
              state: d.readyState || d.state,
              created: d.created,
              target: d.target,
              source: d.meta?.githubCommitMessage || d.meta?.githubCommitRef || 'unknown',
            })),
          }
        }
        const data = await res.json()
        return {
          deployments: (data.deployments || []).map((d: any) => ({
            id: d.uid,
            url: `https://${d.url}`,
            state: d.readyState || d.state,
            created: d.created,
            target: d.target,
            source: d.meta?.githubCommitMessage || d.meta?.githubCommitRef || 'unknown',
          })),
        }
      },
    }),

    forge_read_deploy_log: tool({
      description: 'Read the full build log from a Vercel deployment. Use after forge_check_build or deploy_to_vercel to see detailed error output.',
      parameters: z.object({
        deploymentId: z.string().describe('Vercel deployment ID (from forge_check_build, deploy_to_vercel, or forge_deployment_status)'),
        errorsOnly: z.boolean().optional().describe('Only show error-related lines (default: false)'),
      }),
      execute: async ({ deploymentId, errorsOnly }) => {
        const token = VERCEL_TOKEN
        if (!token) return { error: 'No Vercel deploy token configured' }
        const teamParam = VERCEL_TEAM ? `?teamId=${VERCEL_TEAM}` : ''
        const res = await fetch(`https://api.vercel.com/v2/deployments/${deploymentId}/events${teamParam}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(ctx.defaultTimeout),
        })
        if (!res.ok) return { error: `Vercel API ${res.status}` }
        const events = await res.json()
        const allEvents = Array.isArray(events) ? events : []

        let logs: string[]
        if (errorsOnly) {
          logs = allEvents
            .filter((e: any) => {
              if (e.type === 'error') return true
              const text = e.payload?.text || ''
              return text.match(/error|Error|failed|FAIL|Module not found|Cannot find|SyntaxError|TypeError|warning|Warning/)
            })
            .map((e: any) => {
              const text = e.payload?.text || e.text || ''
              return `[${e.type}] ${text}`
            })
            .filter((l: string) => l.length > 10)
            .slice(-50)
        } else {
          logs = allEvents
            .filter((e: any) => e.type === 'stdout' || e.type === 'stderr' || e.type === 'error' || e.type === 'command')
            .map((e: any) => {
              const text = e.payload?.text || e.text || ''
              return `[${e.type}] ${text}`
            })
            .filter((l: string) => l.length > 10)
            .slice(-80)
        }
        return { logs, lineCount: logs.length, totalEvents: allEvents.length }
      },
    }),

    start_sandbox: tool({
      description: 'Start a live preview sandbox for the current project. Uploads files to v0 Platform API and returns a live preview URL. Free — no tokens consumed. Use when the user wants to see their app running live.',
      parameters: z.object({}),
      execute: async () => {
        if (!ctx.projectId) return { error: 'No project ID — save the project first.' }
        const files = ctx.vfs.toRecord()
        if (Object.keys(files).length === 0) return { error: 'No files to preview.' }
        const result = await createV0Sandbox(ctx.projectId, files)
        return result
      },
    }),

    stop_sandbox: tool({
      description: 'Stop the running preview sandbox for the current project.',
      parameters: z.object({}),
      execute: async () => {
        if (!ctx.projectId) return { error: 'No project ID.' }
        return destroyV0Sandbox(ctx.projectId)
      },
    }),

    sandbox_status: tool({
      description: 'Check the status of the preview sandbox for the current project.',
      parameters: z.object({}),
      execute: async () => {
        if (!ctx.projectId) return { error: 'No project ID.' }
        const status = getV0SandboxStatus(ctx.projectId)
        if (!status) return { active: false, note: 'No sandbox running. Use start_sandbox to create one.' }
        return { active: true, ...status }
      },
    }),
  }
}
