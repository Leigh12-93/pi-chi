import { NextResponse, after } from 'next/server'
import { getSession } from '@/lib/auth'
import { isValidUUID } from '@/lib/validate'
import { supabaseFetch } from '@/lib/supabase-fetch'
import { githubFetch, batchParallel, GITHUB_TOKEN as LIB_GITHUB_TOKEN } from '@/lib/github'
import { detectFramework, VERCEL_TOKEN as LIB_VERCEL_TOKEN, VERCEL_TEAM as LIB_VERCEL_TEAM } from '@/lib/vercel'

const VERCEL_TOKEN = LIB_VERCEL_TOKEN
const VERCEL_TEAM = LIB_VERCEL_TEAM
const GITHUB_TOKEN = LIB_GITHUB_TOKEN

// ─── Progress helper ───────────────────────────────────────────

async function updateProgress(taskId: string, progress: string) {
  await supabaseFetch(`/forge_tasks?id=eq.${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ progress }),
  })
}

// ─── Task executors ────────────────────────────────────────────

async function executeDeploy(taskId: string, params: { projectName: string; files: Record<string, string>; framework?: string }) {
  if (!VERCEL_TOKEN) throw new Error('VERCEL_TOKEN not configured')
  const startTime = Date.now()
  const buildLogs: string[] = []

  // Structured progress: stores JSON with stage, logs, metadata
  const setProgress = async (stage: string, message: string, extra?: Record<string, unknown>) => {
    await updateProgress(taskId, JSON.stringify({
      stage, message,
      logs: buildLogs.slice(-80),
      elapsed: Math.round((Date.now() - startTime) / 1000),
      ...extra,
    }))
  }

  const fileCount = Object.keys(params.files).length
  await setProgress('upload', `Uploading ${fileCount} files to Vercel...`, { fileCount })

  const fileEntries = Object.entries(params.files).map(([file, data]) => ({ file, data }))
  const fw = params.framework || detectFramework(params.files) || 'static'

  const teamParam = VERCEL_TEAM ? `?teamId=${VERCEL_TEAM}` : ''
  await setProgress('upload', `Creating ${fw} deployment...`, { fileCount, framework: fw })

  const deployName = params.projectName.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 52)

  const res = await fetch(`https://api.vercel.com/v13/deployments${teamParam}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: deployName,
      files: fileEntries,
      projectSettings: { framework: fw === 'static' ? undefined : fw },
    }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || `Vercel API error (HTTP ${res.status})`)

  const deployId = data.id
  const deployUrl = `https://${data.url}`
  let state = data.readyState || 'QUEUED'

  buildLogs.push(`▸ Project: ${deployName}`)
  buildLogs.push(`▸ Framework: ${fw}`)
  buildLogs.push(`▸ Files: ${fileCount}`)
  buildLogs.push(`▸ URL: ${deployUrl}`)
  buildLogs.push('')

  await setProgress('build', 'Queued for build...', { url: deployUrl, framework: fw, fileCount })

  // Poll for build completion (up to 120s)
  let attempts = 0
  while (['QUEUED', 'BUILDING', 'INITIALIZING'].includes(state) && attempts < 24) {
    await new Promise(r => setTimeout(r, 5000))
    attempts++

    // Fetch build events/logs from Vercel
    try {
      const logsRes = await fetch(
        `https://api.vercel.com/v2/deployments/${deployId}/events${teamParam}`,
        { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } },
      )
      if (logsRes.ok) {
        const events = await logsRes.json()
        const allEvents = Array.isArray(events) ? events : []
        const logLines = allEvents
          .filter((e: Record<string, unknown>) => {
            const payload = e.payload as Record<string, unknown> | undefined
            return payload && typeof payload.text === 'string'
          })
          .map((e: Record<string, unknown>) => {
            const payload = e.payload as Record<string, string>
            return payload.text
          })
          .filter(Boolean)

        if (logLines.length > 0) {
          // Keep initial metadata lines (5), replace rest with fresh event data
          buildLogs.length = 5
          buildLogs.push(...logLines)
        }
      }
    } catch { /* ignore log fetch errors */ }

    // Check deployment status
    try {
      const check = await fetch(`https://api.vercel.com/v13/deployments/${deployId}${teamParam}`, {
        headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
      })
      if (check.ok) {
        const checkData = await check.json()
        state = checkData.readyState || state
        if (state === 'READY') {
          await setProgress('ready', 'Deployment ready!', { url: deployUrl, framework: fw, fileCount })
        } else if (state === 'ERROR' || state === 'CANCELED') {
          await setProgress('error', 'Build failed', { url: deployUrl, framework: fw, fileCount })
          // Extract error lines from accumulated logs
          const errorLines = buildLogs
            .filter(l =>
              l.includes('Error') || l.includes('error') ||
              l.includes('failed') || l.includes('FAIL') ||
              l.includes('Module not found') || l.includes('Cannot find') ||
              l.includes('SyntaxError') || l.includes('TypeError')
            )
            .slice(-30)
          throw new Error(errorLines.length > 0 ? errorLines.join('\n') : 'Build failed on Vercel')
        } else {
          const elapsed = Math.round((Date.now() - startTime) / 1000)
          await setProgress('build', `Building... (${elapsed}s)`, { url: deployUrl, framework: fw, fileCount })
        }
      }
    } catch (e) {
      if (e instanceof Error && (e.message.includes('Build failed') || e.message.includes('Error') || e.message.includes('error') || e.message.includes('Module not found'))) throw e
      // network error — keep polling
    }
  }

  if (['QUEUED', 'BUILDING', 'INITIALIZING'].includes(state)) {
    throw new Error(`Deployment timed out after ${Math.round((Date.now() - startTime) / 1000)}s (state: ${state}). Check Vercel dashboard.`)
  }

  const duration = Math.round((Date.now() - startTime) / 1000)
  return { url: deployUrl, id: deployId, readyState: state, framework: fw, fileCount, duration }
}

async function executeGithubCreate(taskId: string, params: {
  repoName: string; isPublic?: boolean; description?: string; files: Record<string, string>; githubToken?: string
}) {
  const token = params.githubToken || GITHUB_TOKEN
  if (!token) throw new Error('Not authenticated. Sign in with GitHub.')
  const startTime = Date.now()

  await updateProgress(taskId, `Creating repository ${params.repoName}...`)

  const repo = await githubFetch('/user/repos', token, {
    method: 'POST',
    body: JSON.stringify({
      name: params.repoName,
      description: params.description || 'Built with Forge',
      private: !params.isPublic,
      auto_init: true,
    }),
  })
  if (repo.error) {
    if (repo.status === 422) throw new Error(`Repository "${params.repoName}" already exists. Choose a different name.`)
    throw new Error(`Failed to create repo: ${repo.error}`)
  }

  const owner = repo.owner.login
  await updateProgress(taskId, 'Waiting for repo initialization...')
  await new Promise(resolve => setTimeout(resolve, 2000))

  // Retry getting the initial ref (GitHub can be slow to initialize)
  let ref: any
  for (let attempt = 0; attempt < 3; attempt++) {
    ref = await githubFetch(`/repos/${owner}/${params.repoName}/git/refs/heads/main`, token)
    if (!ref.error) break
    await new Promise(resolve => setTimeout(resolve, 1500))
  }
  if (ref.error) throw new Error(`Repo created but failed to get initial ref: ${ref.error}`)
  const parentSha = ref.object.sha

  const fileEntries = Object.entries(params.files)
  const totalFiles = fileEntries.length
  await updateProgress(taskId, `Uploading ${totalFiles} files...`)

  // Upload blobs in parallel batches of 5
  const blobs = await batchParallel(fileEntries, 5, async ([path, content], index) => {
    if (index % 5 === 0) {
      await updateProgress(taskId, `Uploading files (${Math.min(index + 5, totalFiles)}/${totalFiles})...`)
    }
    const blob = await githubFetch(`/repos/${owner}/${params.repoName}/git/blobs`, token, {
      method: 'POST',
      body: JSON.stringify({ content, encoding: 'utf-8' }),
    })
    if (blob.error) throw new Error(`Failed to create blob for ${path}: ${blob.error}`)
    return { path, mode: '100644' as const, type: 'blob' as const, sha: blob.sha as string }
  })

  await updateProgress(taskId, 'Creating commit tree...')
  const tree = await githubFetch(`/repos/${owner}/${params.repoName}/git/trees`, token, {
    method: 'POST',
    body: JSON.stringify({ base_tree: parentSha, tree: blobs }),
  })
  if (tree.error) throw new Error(`Failed to create tree: ${tree.error}`)

  await updateProgress(taskId, 'Pushing initial commit...')
  const commit = await githubFetch(`/repos/${owner}/${params.repoName}/git/commits`, token, {
    method: 'POST',
    body: JSON.stringify({ message: 'Initial commit from Forge', tree: tree.sha, parents: [parentSha] }),
  })
  if (commit.error) throw new Error(`Failed to create commit: ${commit.error}`)

  const updateRef = await githubFetch(`/repos/${owner}/${params.repoName}/git/refs/heads/main`, token, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha }),
  })
  if (updateRef.error) throw new Error(`Failed to update branch ref: ${updateRef.error}`)

  const duration = Math.round((Date.now() - startTime) / 1000)
  await updateProgress(taskId, 'Done!')
  return {
    url: repo.html_url,
    owner,
    repoName: params.repoName,
    commitSha: commit.sha,
    filesCount: totalFiles,
    duration,
  }
}

async function executeGithubPush(taskId: string, params: {
  owner: string; repo: string; message: string; branch?: string; files: Record<string, string>; githubToken?: string
}) {
  const token = params.githubToken || GITHUB_TOKEN
  if (!token) throw new Error('Not authenticated. Sign in with GitHub.')
  const startTime = Date.now()
  const branchName = params.branch || 'main'

  await updateProgress(taskId, `Fetching ${branchName} branch...`)

  // Try specified branch, fall back to main/master
  let ref = await githubFetch(`/repos/${params.owner}/${params.repo}/git/refs/heads/${branchName}`, token)
  if (ref.error && branchName === 'main') {
    ref = await githubFetch(`/repos/${params.owner}/${params.repo}/git/refs/heads/master`, token)
  }
  if (ref.error) throw new Error(`Failed to get branch "${branchName}": ${ref.error}`)
  const parentSha = ref.object.sha

  const fileEntries = Object.entries(params.files)
  const totalFiles = fileEntries.length
  await updateProgress(taskId, `Uploading ${totalFiles} files...`)

  // Upload blobs in parallel batches of 5
  const blobs = await batchParallel(fileEntries, 5, async ([path, content], index) => {
    if (index % 5 === 0) {
      await updateProgress(taskId, `Uploading files (${Math.min(index + 5, totalFiles)}/${totalFiles})...`)
    }
    const blob = await githubFetch(`/repos/${params.owner}/${params.repo}/git/blobs`, token, {
      method: 'POST',
      body: JSON.stringify({ content, encoding: 'utf-8' }),
    })
    if (blob.error) throw new Error(`Failed to create blob for ${path}: ${blob.error}`)
    return { path, mode: '100644' as const, type: 'blob' as const, sha: blob.sha as string }
  })

  await updateProgress(taskId, 'Creating commit tree...')
  const tree = await githubFetch(`/repos/${params.owner}/${params.repo}/git/trees`, token, {
    method: 'POST',
    body: JSON.stringify({ base_tree: parentSha, tree: blobs }),
  })
  if (tree.error) throw new Error(`Failed to create tree: ${tree.error}`)

  await updateProgress(taskId, 'Pushing commit...')
  const commit = await githubFetch(`/repos/${params.owner}/${params.repo}/git/commits`, token, {
    method: 'POST',
    body: JSON.stringify({ message: params.message, tree: tree.sha, parents: [parentSha] }),
  })
  if (commit.error) throw new Error(`Failed to commit: ${commit.error}`)

  const update = await githubFetch(`/repos/${params.owner}/${params.repo}/git/refs/heads/${branchName}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha }),
  })
  if (update.error) throw new Error(`Failed to update ref: ${update.error}`)

  const duration = Math.round((Date.now() - startTime) / 1000)
  await updateProgress(taskId, 'Done!')
  return {
    commitSha: commit.sha,
    filesCount: totalFiles,
    repoUrl: `https://github.com/${params.owner}/${params.repo}`,
    commitUrl: `https://github.com/${params.owner}/${params.repo}/commit/${commit.sha}`,
    duration,
  }
}

// ─── POST: Start a new background task ────────────────────────

export async function POST(req: Request) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const body = await req.json()
  const { projectId, type, params } = body

  if (!type) {
    return NextResponse.json({ error: 'Missing task type' }, { status: 400 })
  }

  // Validate projectId format if provided
  if (projectId && !isValidUUID(projectId)) {
    return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
  }

  // Verify project ownership when projectId is provided
  if (projectId) {
    const projCheck = await supabaseFetch(
      `/forge_projects?id=eq.${encodeURIComponent(projectId)}&github_username=eq.${encodeURIComponent(session.githubUsername)}&select=id&limit=1`
    )
    if (!projCheck.ok || !Array.isArray(projCheck.data) || projCheck.data.length === 0) {
      return NextResponse.json({ error: 'Project not found or access denied' }, { status: 403 })
    }
  }

  // Create task row in Supabase
  const insertResult = await supabaseFetch('/forge_tasks', {
    method: 'POST',
    body: JSON.stringify({
      project_id: projectId || null,
      type,
      status: 'running',
    }),
  })

  if (!insertResult.ok || !Array.isArray(insertResult.data) || insertResult.data.length === 0) {
    return NextResponse.json({ error: 'Failed to create task record' }, { status: 500 })
  }

  const taskId = (insertResult.data[0] as { id: string }).id

  // Fire-and-forget: execute the operation and update the row
  const execute = async () => {
    try {
      let result: unknown

      switch (type) {
        case 'deploy':
          result = await executeDeploy(taskId, params)
          break
        case 'github_create':
          result = await executeGithubCreate(taskId, params)
          break
        case 'github_push':
          result = await executeGithubPush(taskId, params)
          break
        default:
          throw new Error(`Unknown task type: ${type}`)
      }

      await supabaseFetch(`/forge_tasks?id=eq.${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'completed',
          result: typeof result === 'object' ? result : { value: result },
        }),
      })
    } catch (err) {
      await supabaseFetch(`/forge_tasks?id=eq.${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        }),
      })
    }
  }

  // Run after response is sent — keeps serverless function alive until execute() completes
  after(execute)

  return NextResponse.json({ taskId, status: 'running' })
}

// ─── GET: List active/recent tasks for a project ──────────────

export async function GET(req: Request) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const url = new URL(req.url)
  const projectId = url.searchParams.get('projectId')

  // Validate projectId format if provided
  if (projectId && !isValidUUID(projectId)) {
    return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
  }

  let path = `/forge_tasks?order=created_at.desc&limit=20`
  if (projectId) {
    path += `&project_id=eq.${encodeURIComponent(projectId)}`
  }

  const result = await supabaseFetch(path)
  if (!result.ok) {
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 })
  }

  return NextResponse.json({ tasks: result.data })
}
