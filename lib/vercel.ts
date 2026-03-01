// ═══════════════════════════════════════════════════════════════════
// Vercel Deploy API helpers
// ═══════════════════════════════════════════════════════════════════

export const VERCEL_TOKEN = (process.env.FORGE_DEPLOY_TOKEN || process.env.VERCEL_TOKEN || '').trim()
export const VERCEL_TEAM = process.env.VERCEL_TEAM_ID || ''

export function detectFramework(files: Record<string, string>): string | undefined {
  if (files['next.config.ts'] || files['next.config.js'] || files['next.config.mjs']) return 'nextjs'
  if (files['vite.config.ts'] || files['vite.config.js'] || files['vite.config.mjs']) return 'vite'
  if (files['nuxt.config.ts'] || files['nuxt.config.js']) return 'nuxtjs'
  if (files['astro.config.mjs'] || files['astro.config.ts']) return 'astro'
  if (files['svelte.config.js'] || files['svelte.config.ts']) return 'sveltekit'
  if (files['remix.config.js'] || files['remix.config.ts']) return 'remix'
  return undefined // let Vercel auto-detect for static sites
}

export async function vercelDeploy(name: string, files: Record<string, string>, framework?: string, onProgress?: (msg: string) => Promise<void>, envVars?: Record<string, string>) {
  if (!VERCEL_TOKEN) return { error: 'VERCEL_TOKEN not configured' }

  const progress = onProgress || (async () => {})
  const fileEntries = Object.entries(files).map(([file, data]) => ({ file, data }))
  const fw = framework || detectFramework(files)
  const deployName = name.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 52)

  await progress('Uploading files...')
  const teamParam = VERCEL_TEAM ? `?teamId=${VERCEL_TEAM}` : ''
  const uploadCtrl = AbortController ? new AbortController() : undefined
  const uploadTimeout = uploadCtrl ? setTimeout(() => uploadCtrl.abort(), 30000) : undefined
  const res = await fetch(`https://api.vercel.com/v13/deployments${teamParam}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: deployName,
      files: fileEntries,
      projectSettings: { framework: fw },
      ...(envVars && Object.keys(envVars).length > 0 ? { env: envVars } : {}),
    }),
    signal: uploadCtrl?.signal,
  })
  if (uploadTimeout) clearTimeout(uploadTimeout)

  const data = await res.json()
  if (!res.ok) return { error: data.error?.message || `Vercel API error (HTTP ${res.status})` }

  const deployId = data.id
  const deployUrl = `https://${data.url}`
  let state = data.readyState || 'QUEUED'

  await progress('Build queued...')
  // Poll for build completion (up to 120s)
  let attempts = 0
  while (['QUEUED', 'BUILDING', 'INITIALIZING'].includes(state) && attempts < 24) {
    await new Promise(r => setTimeout(r, 5000))
    attempts++
    try {
      const pollCtrl = new AbortController()
      const pollTimeout = setTimeout(() => pollCtrl.abort(), 15000)
      const check = await fetch(`https://api.vercel.com/v13/deployments/${deployId}${teamParam}`, {
        headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
        signal: pollCtrl.signal,
      })
      clearTimeout(pollTimeout)
      if (check.ok) {
        const checkData = await check.json()
        const prevState = state
        state = checkData.readyState || state
        if (state === 'BUILDING' && (prevState !== 'BUILDING' || attempts % 2 === 0)) {
          await progress(`Building... (${attempts * 5}s)`)
        } else if (state === 'QUEUED') {
          await progress(`Build queued... (${attempts * 5}s)`)
        }
        if (state === 'ERROR' || state === 'CANCELED') {
          await progress('Build failed — fetching error logs...')
          // Fetch build errors
          let errorLog = 'Build failed on Vercel'
          try {
            const logsRes = await fetch(
              `https://api.vercel.com/v2/deployments/${deployId}/events${teamParam}`,
              { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } },
            )
            if (logsRes.ok) {
              const events = await logsRes.json()
              const errorLines = (Array.isArray(events) ? events : [])
                .filter((e: any) => e.type === 'error' || (e.payload?.text || '').match(/error|Error|failed|FAIL|Module not found|Cannot find|SyntaxError|TypeError/))
                .map((e: any) => e.payload?.text || '')
                .filter(Boolean)
                .slice(-30)
              if (errorLines.length > 0) errorLog = errorLines.join('\n')
            }
          } catch { /* ignore */ }
          return { error: errorLog, url: deployUrl, id: deployId, readyState: state }
        }
      }
    } catch {
      // network error — keep polling
    }
  }

  if (['QUEUED', 'BUILDING', 'INITIALIZING'].includes(state)) {
    return { url: deployUrl, id: deployId, readyState: state, note: 'Build still in progress. Use check_task_status or forge_deployment_status to check later.' }
  }

  // Fetch the stable project URL (alias) in addition to the unique deployment URL
  let productionUrl = deployUrl
  try {
    const aliasRes = await fetch(`https://api.vercel.com/v9/projects/${deployName}${teamParam}`, {
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
    })
    if (aliasRes.ok) {
      const projectData = await aliasRes.json()
      const aliases = projectData.targets?.production?.alias || projectData.alias || []
      if (aliases.length > 0) {
        productionUrl = `https://${aliases[0]}`
      }
    }
  } catch { /* non-critical — fall back to deployment URL */ }

  await progress('Finalizing...')
  return { url: productionUrl, deployUrl, id: deployId, readyState: state, framework: fw, fileCount: Object.keys(files).length }
}
