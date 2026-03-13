import { NextResponse, after } from 'next/server'
import { getSession } from '@/lib/auth'
import { isValidUUID } from '@/lib/validate'
import { supabaseFetch } from '@/lib/supabase-fetch'
import { githubFetch, batchParallel, GITHUB_TOKEN as LIB_GITHUB_TOKEN, getDefaultBranch } from '@/lib/github'
import { detectFramework, VERCEL_TOKEN as LIB_VERCEL_TOKEN, VERCEL_TEAM as LIB_VERCEL_TEAM } from '@/lib/vercel'

const VERCEL_TOKEN = LIB_VERCEL_TOKEN
const VERCEL_TEAM = LIB_VERCEL_TEAM
const GITHUB_TOKEN = LIB_GITHUB_TOKEN
const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || '').trim()

async function updateProgress(taskId: string, progress: string) {
  await supabaseFetch(`/pi_tasks?id=eq.${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ progress }),
  })
}

interface ErrorClassification {
  fixable: boolean
  targetFiles: string[]
  errorType: string
  errorSummary: string
}

/**
 * Classify a build error to decide if Haiku can auto-fix it.
 * Only returns fixable=true for single-file errors with clear patterns.
 */
function classifyBuildError(errorText: string, files: Record<string, string>): ErrorClassification {
  const lines = errorText.split('\n').filter(Boolean)
  const filePaths = Object.keys(files)

  // Extract file references from error text
  const referencedFiles = new Set<string>()
  for (const line of lines) {
    // Match file paths including Next.js route groups with parentheses: (customer), (auth), etc.
    const fileMatches = line.match(/(?:\.\/)?([a-zA-Z0-9_\-/.()]+\.(?:tsx?|jsx?|css|json|mjs))/g)
    if (fileMatches) {
      for (const match of fileMatches) {
        const clean = match.replace(/^\.\//, '').replace(/:\d+.*$/, '')
        if (filePaths.includes(clean) || filePaths.includes(`/${clean}`)) {
          referencedFiles.add(filePaths.find(f => f === clean || f === `/${clean}`) || clean)
        }
      }
    }

    // Fallback: match Next.js "error on /route/page" pattern and infer the file
    const routeMatch = line.match(/error on \/([^\s:,]+)\/page/)
    if (routeMatch) {
      const routePath = routeMatch[1]
      // Try common Next.js app router patterns: app/route/page.tsx, app/(group)/route/page.tsx
      for (const fp of filePaths) {
        const norm = fp.replace(/^\//, '')
        if (norm.match(new RegExp(`app/(?:\\([^)]+\\)/)?${routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/page\\.tsx?$`))) {
          referencedFiles.add(fp)
        }
      }
    }
  }

  const targetFiles = Array.from(referencedFiles)

  // Determine error type
  let errorType = 'unknown'
  const errorLower = errorText.toLowerCase()
  if (errorLower.includes('module not found') || errorLower.includes('cannot find module')) {
    errorType = 'missing_import'
  } else if (errorLower.includes('type error') || errorLower.includes('typeerror') || errorLower.includes('is not assignable')) {
    errorType = 'type_error'
  } else if (errorLower.includes('syntaxerror') || errorLower.includes('unexpected token') || errorLower.includes('parsing error')) {
    errorType = 'syntax_error'
  } else if (errorLower.includes('cannot find name') || errorLower.includes('is not defined')) {
    errorType = 'reference_error'
  } else if (errorLower.includes('jsx') || errorLower.includes('react')) {
    errorType = 'jsx_error'
  } else if (errorLower.includes('export') || errorLower.includes('import')) {
    errorType = 'import_export_error'
  }

  // If no files matched but error mentions "exiting the build" or a page route,
  // try to find the page file from the error text
  if (targetFiles.length === 0) {
    const exitMatch = errorText.match(/error on \/([^\s:,]+)/)
    if (exitMatch) {
      const route = exitMatch[1].replace(/^\//, '')
      // Search all files for a matching page/layout
      for (const fp of filePaths) {
        const norm = fp.replace(/^\//, '')
        if (norm.includes(route) && (norm.endsWith('page.tsx') || norm.endsWith('page.ts') || norm.endsWith('page.jsx'))) {
          targetFiles.push(fp)
        }
      }
    }
  }

  // Confidence gate: only auto-fix if:
  // 1. We can identify the target file(s) OR error type is actionable
  // 2. Max 3 files affected
  // 3. Error type is recognizable
  // 4. Error is not a fundamental architecture issue
  const isSimpleError = errorType !== 'unknown'
  const hasTargets = targetFiles.length >= 1 && targetFiles.length <= 3
  const isNotArchitectural = !errorLower.includes('circular dependency') &&
    !errorLower.includes('out of memory') &&
    !errorLower.includes('heap') &&
    !errorLower.includes('maximum call stack')

  return {
    fixable: isSimpleError && hasTargets && isNotArchitectural,
    targetFiles,
    errorType,
    errorSummary: lines.slice(0, 15).join('\n'),
  }
}

interface AutoFixResult {
  fixed: boolean
  patches: Record<string, string>  // path → new content
  explanation: string
}

async function autoFixWithHaiku(
  errorText: string,
  classification: ErrorClassification,
  files: Record<string, string>,
): Promise<AutoFixResult> {
  if (!ANTHROPIC_API_KEY) {
    return { fixed: false, patches: {}, explanation: 'No API key configured' }
  }

  // Build context: include the broken file(s) + any imported files
  const contextFiles: Record<string, string> = {}
  for (const target of classification.targetFiles) {
    if (files[target]) contextFiles[target] = files[target]
  }

  // If error references imports, include those files too
  const importPattern = /from\s+['"]([^'"]+)['"]/g
  for (const content of Object.values(contextFiles)) {
    let match
    while ((match = importPattern.exec(content)) !== null) {
      const importPath = match[1]
      // Resolve relative imports
      for (const ext of ['', '.ts', '.tsx', '.js', '.jsx']) {
        const candidates = [
          importPath + ext,
          `${importPath}/index${ext}`,
        ]
        for (const candidate of candidates) {
          const resolvedPaths = Object.keys(files).filter(f =>
            f.endsWith(candidate) || f === candidate || f === `/${candidate}`
          )
          for (const resolved of resolvedPaths.slice(0, 2)) {
            if (!contextFiles[resolved]) {
              contextFiles[resolved] = files[resolved]
            }
          }
        }
      }
    }
  }

  // Cap context to avoid blowing up the prompt
  const contextEntries = Object.entries(contextFiles).slice(0, 5)
  const fileContext = contextEntries
    .map(([path, content]) => `--- ${path} ---\n${content}`)
    .join('\n\n')

  // Also include package.json if available for dependency context
  const pkgJson = files['package.json'] || files['/package.json']
  const pkgContext = pkgJson ? `\n\n--- package.json ---\n${pkgJson}` : ''

  const prompt = `You are a build error auto-fixer. A Vercel deployment failed with this error:

ERROR TYPE: ${classification.errorType}
TARGET FILES: ${classification.targetFiles.join(', ')}

BUILD ERROR:
${errorText}

PROJECT FILES:
${fileContext}${pkgContext}

RULES:
1. ONLY fix the specific error shown. Do NOT refactor or improve code.
2. Return fixes ONLY for files that need changes.
3. If the fix requires adding a new dependency or changing more than 2 files, set "confident" to false.
4. If you're not sure the fix is correct, set "confident" to false.
5. Return the COMPLETE file content for each file you fix (not just the changed lines).

Respond with ONLY valid JSON (no markdown, no explanation outside JSON):
{
  "confident": true/false,
  "explanation": "one-line description of the fix",
  "patches": {
    "path/to/file.tsx": "complete fixed file content"
  }
}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      return { fixed: false, patches: {}, explanation: `Haiku API error: ${res.status}` }
    }

    const data = await res.json()
    const text = data.content?.[0]?.text || ''

    // Parse JSON response — handle potential markdown wrapping
    let jsonStr = text.trim()
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    const parsed = JSON.parse(jsonStr)

    if (!parsed.confident) {
      return { fixed: false, patches: {}, explanation: parsed.explanation || 'Not confident in fix' }
    }

    // Validate patches: must only modify existing files, max 2 files
    const patches: Record<string, string> = {}
    const patchEntries = Object.entries(parsed.patches || {})

    if (patchEntries.length === 0 || patchEntries.length > 2) {
      return { fixed: false, patches: {}, explanation: 'Fix touches too many files or no files' }
    }

    for (const [path, content] of patchEntries) {
      if (typeof content !== 'string') continue
      // Verify the file exists in the project
      if (files[path] || files[`/${path}`]) {
        patches[files[path] ? path : `/${path}`] = content
      }
    }

    if (Object.keys(patches).length === 0) {
      return { fixed: false, patches: {}, explanation: 'No valid patches produced' }
    }

    return {
      fixed: true,
      patches,
      explanation: parsed.explanation || 'Applied auto-fix',
    }
  } catch (e) {
    return { fixed: false, patches: {}, explanation: `Auto-fix failed: ${e instanceof Error ? e.message : String(e)}` }
  }
}

interface DeployResult {
  url: string
  id: string
  readyState: string
  framework: string
  fileCount: number
  duration: number
  autoFixed?: boolean
  fixExplanation?: string
  fixedFiles?: Record<string, string>
}

async function submitAndPollDeploy(
  _taskId: string,
  files: Record<string, string>,
  projectName: string,
  framework: string | undefined,
  startTime: number,
  buildLogs: string[],
  setProgress: (stage: string, message: string, extra?: Record<string, unknown>) => Promise<void>,
): Promise<{ success: true; result: DeployResult } | { success: false; errorText: string; errorLines: string[] }> {

  const fileCount = Object.keys(files).length
  const fw = framework || detectFramework(files) || 'static'
  const teamParam = VERCEL_TEAM ? `?teamId=${VERCEL_TEAM}` : ''
  const baseName = projectName.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '')
  const deployName = (baseName.startsWith('pi-') ? baseName : `pi-${baseName}`).slice(0, 52)

  await setProgress('upload', `Uploading ${fileCount} files...`, { fileCount, framework: fw })

  // Find or create Vercel project so deployments link to it
  let vercelProjectId: string | undefined
  try {
    const projRes = await fetch(`https://api.vercel.com/v9/projects/${deployName}${teamParam}`, {
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
    })
    if (projRes.ok) {
      const projData = await projRes.json()
      vercelProjectId = projData.id
    } else if (projRes.status === 404) {
      // Create the project
      const createRes = await fetch(`https://api.vercel.com/v10/projects${teamParam}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: deployName, framework: fw === 'static' ? undefined : fw }),
      })
      if (createRes.ok) {
        const createData = await createRes.json()
        vercelProjectId = createData.id
      }
    }
  } catch { /* non-critical — deploy without project link */ }

  const fileEntries = Object.entries(files).map(([file, data]) => ({ file, data }))

  const res = await fetch(`https://api.vercel.com/v13/deployments${teamParam}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: deployName,
      ...(vercelProjectId ? { project: vercelProjectId } : {}),
      files: fileEntries,
      projectSettings: { framework: fw === 'static' ? undefined : fw },
    }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || `Vercel API error (HTTP ${res.status})`)

  const deployId = data.id
  const deployUrl = `https://${data.url}`
  let state = data.readyState || 'QUEUED'

  // Reset logs with fresh metadata
  buildLogs.length = 0
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

    // Fetch build events/logs
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
          const errorLines = buildLogs
            .filter(l =>
              l.includes('Error') || l.includes('error') ||
              l.includes('failed') || l.includes('FAIL') ||
              l.includes('Module not found') || l.includes('Cannot find') ||
              l.includes('SyntaxError') || l.includes('TypeError')
            )
            .slice(-30)
          const errorText = errorLines.length > 0 ? errorLines.join('\n') : 'Build failed on Vercel'
          return { success: false, errorText, errorLines }
        } else {
          const elapsed = Math.round((Date.now() - startTime) / 1000)
          await setProgress('build', `Building... (${elapsed}s)`, { url: deployUrl, framework: fw, fileCount })
        }
      }
    } catch (e) {
      if (e instanceof Error && (
        e.message.includes('Build failed') || e.message.includes('Error') ||
        e.message.includes('Module not found')
      )) {
        return { success: false, errorText: e.message, errorLines: [] }
      }
    }
  }

  if (['QUEUED', 'BUILDING', 'INITIALIZING'].includes(state)) {
    throw new Error(`Deployment timed out after ${Math.round((Date.now() - startTime) / 1000)}s (state: ${state}). Check Vercel dashboard.`)
  }

  const duration = Math.round((Date.now() - startTime) / 1000)
  return {
    success: true,
    result: { url: deployUrl, id: deployId, readyState: state, framework: fw, fileCount, duration },
  }
}

const MAX_AUTO_FIX_ATTEMPTS = 2

async function executeDeploy(taskId: string, params: { projectName: string; files: Record<string, string>; framework?: string }) {
  if (!VERCEL_TOKEN) throw new Error('VERCEL_TOKEN not configured')
  const startTime = Date.now()
  const buildLogs: string[] = []
  let currentFiles = { ...params.files }
  let allFixedFiles: Record<string, string> = {}

  const setProgress = async (stage: string, message: string, extra?: Record<string, unknown>) => {
    await updateProgress(taskId, JSON.stringify({
      stage, message,
      logs: buildLogs.slice(-80),
      elapsed: Math.round((Date.now() - startTime) / 1000),
      // Include fixed files so frontend can sync
      ...(Object.keys(allFixedFiles).length > 0 ? { fixedFiles: allFixedFiles } : {}),
      ...extra,
    }))
  }

  let previousError = ''  // Track previous error to detect regressions

  for (let attempt = 0; attempt <= MAX_AUTO_FIX_ATTEMPTS; attempt++) {
    const deployResult = await submitAndPollDeploy(
      taskId, currentFiles, params.projectName, params.framework,
      startTime, buildLogs, setProgress,
    )

    if (deployResult.success) {
      return {
        ...deployResult.result,
        ...(Object.keys(allFixedFiles).length > 0 ? {
          autoFixed: true,
          fixedFiles: allFixedFiles,
          fixExplanation: `Auto-fixed ${Object.keys(allFixedFiles).length} file(s)`,
        } : {}),
      }
    }

    // Build failed — try auto-fix if we have attempts left
    if (attempt >= MAX_AUTO_FIX_ATTEMPTS) {
      throw new Error(deployResult.errorText)
    }

    // REGRESSION CHECK: If auto-fix introduced a NEW/DIFFERENT error, revert and bail
    if (attempt > 0 && previousError) {
      const prevLines = new Set(previousError.split('\n').map(l => l.trim()).filter(Boolean))
      const currLines = deployResult.errorText.split('\n').map(l => l.trim()).filter(Boolean)
      const newErrors = currLines.filter(l => !prevLines.has(l))

      if (newErrors.length > 0) {
        // Auto-fix made things worse — revert to original files
        buildLogs.push('')
        buildLogs.push(`▸ Auto-fix REVERTED: introduced new errors`)
        buildLogs.push(`▸ New errors: ${newErrors.slice(0, 3).join('; ')}`)
        await setProgress('error', 'Auto-fix reverted — introduced new errors', {
          autoFixReverted: true,
        })
        // Throw the ORIGINAL error (pre-fix), not the regressed one
        throw new Error(previousError)
      }

      // Check if error count increased (same errors but more of them)
      if (currLines.length > prevLines.size * 1.5) {
        buildLogs.push('')
        buildLogs.push(`▸ Auto-fix REVERTED: error count increased (${prevLines.size} → ${currLines.length})`)
        await setProgress('error', 'Auto-fix reverted — more errors than before')
        throw new Error(previousError)
      }
    }

    // Save current error for regression comparison
    previousError = deployResult.errorText

    // Classify the error
    const classification = classifyBuildError(deployResult.errorText, currentFiles)

    if (!classification.fixable) {
      buildLogs.push('')
      buildLogs.push(`▸ Auto-fix skipped: ${classification.errorType} affects ${classification.targetFiles.length} file(s) — requires manual fix`)
      await setProgress('error', 'Build error too complex for auto-fix', {
        autoFixSkipped: true,
        errorType: classification.errorType,
      })
      throw new Error(deployResult.errorText)
    }

    // Show auto-fix stage
    buildLogs.push('')
    buildLogs.push(`▸ Auto-fix attempt ${attempt + 1}/${MAX_AUTO_FIX_ATTEMPTS}...`)
    buildLogs.push(`▸ Error type: ${classification.errorType}`)
    buildLogs.push(`▸ Target: ${classification.targetFiles.join(', ')}`)
    await setProgress('autofix', `Auto-fixing ${classification.errorType} in ${classification.targetFiles.join(', ')}...`, {
      autoFixAttempt: attempt + 1,
      autoFixMax: MAX_AUTO_FIX_ATTEMPTS,
      errorType: classification.errorType,
      targetFiles: classification.targetFiles,
    })

    // Snapshot files before fix so we can revert
    const preFixFiles = { ...currentFiles }

    // Call Haiku
    const fixResult = await autoFixWithHaiku(deployResult.errorText, classification, currentFiles)

    if (!fixResult.fixed) {
      buildLogs.push(`▸ Auto-fix declined: ${fixResult.explanation}`)
      await setProgress('error', `Auto-fix not confident: ${fixResult.explanation}`)
      throw new Error(deployResult.errorText)
    }

    // Validate patches don't empty out files or massively change them
    let patchesValid = true
    for (const [path, content] of Object.entries(fixResult.patches)) {
      const original = currentFiles[path] || ''
      // Reject if patch empties the file
      if (content.trim().length === 0 && original.trim().length > 0) {
        patchesValid = false
        break
      }
      // Reject if patch removes >50% of content (likely destructive)
      if (content.length < original.length * 0.5 && original.length > 100) {
        patchesValid = false
        break
      }
    }

    if (!patchesValid) {
      buildLogs.push(`▸ Auto-fix REJECTED: patch would remove too much code`)
      await setProgress('error', 'Auto-fix rejected — changes too destructive')
      // Restore pre-fix state
      Object.assign(currentFiles, preFixFiles)
      throw new Error(deployResult.errorText)
    }

    // Apply patches
    for (const [path, content] of Object.entries(fixResult.patches)) {
      currentFiles[path] = content
      allFixedFiles[path] = content
    }

    buildLogs.push(`▸ Fix applied: ${fixResult.explanation}`)
    buildLogs.push(`▸ Redeploying with fixes...`)
    buildLogs.push('')
    await setProgress('autofix', `Fix applied: ${fixResult.explanation}. Redeploying...`, {
      autoFixAttempt: attempt + 1,
      fixExplanation: fixResult.explanation,
      fixedFiles: allFixedFiles,
    })
  }

  throw new Error('Deployment failed after auto-fix attempts')
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
      description: params.description || 'Built with Pi-Chi',
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
    body: JSON.stringify({ message: 'Initial commit from Pi-Chi', tree: tree.sha, parents: [parentSha] }),
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
  const branchName = params.branch || await getDefaultBranch(params.owner, params.repo, token)

  await updateProgress(taskId, `Fetching ${branchName} branch...`)

  let ref = await githubFetch(`/repos/${params.owner}/${params.repo}/git/refs/heads/${branchName}`, token)
  if (ref.error && branchName === 'main') {
    ref = await githubFetch(`/repos/${params.owner}/${params.repo}/git/refs/heads/master`, token)
  }
  if (ref.error) throw new Error(`Failed to get branch "${branchName}": ${ref.error}`)
  const parentSha = ref.object.sha

  const fileEntries = Object.entries(params.files)
  const totalFiles = fileEntries.length
  await updateProgress(taskId, `Uploading ${totalFiles} files...`)

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

  if (projectId && !isValidUUID(projectId)) {
    return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
  }

  if (projectId) {
    const projCheck = await supabaseFetch(
      `/pi_projects?id=eq.${encodeURIComponent(projectId)}&github_username=eq.${encodeURIComponent(session.githubUsername)}&select=id&limit=1`
    )
    if (!projCheck.ok || !Array.isArray(projCheck.data) || projCheck.data.length === 0) {
      return NextResponse.json({ error: 'Project not found or access denied' }, { status: 403 })
    }
  }

  const insertResult = await supabaseFetch('/pi_tasks', {
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

      await supabaseFetch(`/pi_tasks?id=eq.${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'completed',
          result: typeof result === 'object' ? result : { value: result },
        }),
      })
    } catch (err) {
      await supabaseFetch(`/pi_tasks?id=eq.${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        }),
      })
    }
  }

  after(execute)

  return NextResponse.json({ taskId, status: 'running' })
}

export async function GET(req: Request) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const url = new URL(req.url)
  const projectId = url.searchParams.get('projectId')

  if (projectId && !isValidUUID(projectId)) {
    return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
  }

  let path = `/pi_tasks?order=created_at.desc&limit=20`
  if (projectId) {
    path += `&project_id=eq.${encodeURIComponent(projectId)}`
  }

  const result = await supabaseFetch(path)
  if (!result.ok) {
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 })
  }

  return NextResponse.json({ tasks: result.data })
}
