import { Sandbox } from '@vercel/sandbox'

// ═══════════════════════════════════════════════════════════════════
// Vercel Sandbox Manager
// Manages ephemeral Firecracker microVMs for live project preview
// ═══════════════════════════════════════════════════════════════════

export interface SandboxSession {
  sandboxId: string
  url: string
  status: 'booting' | 'writing' | 'installing' | 'starting' | 'running' | 'error'
  error?: string
  createdAt: number
  framework: string
}

// In-memory store — works per serverless instance.
const activeSandboxes = new Map<string, { sandbox: Sandbox; session: SandboxSession }>()

const BASE_PATH = '/vercel/sandbox/app'
const DEV_PORT = 3000

/**
 * Create a sandbox, write project files, install deps, start dev server.
 * Returns sandbox URL for iframe preview.
 */
export async function createSandbox(
  projectId: string,
  files: Record<string, string>,
  framework?: string,
): Promise<SandboxSession & { ok: boolean }> {
  if (!isVercelSandboxConfigured()) {
    return {
      ok: false,
      sandboxId: '',
      url: '',
      status: 'error',
      error: 'Vercel Sandbox not configured. Run `vercel link && vercel env pull` for local dev, or deploy to Vercel for automatic auth.',
      createdAt: Date.now(),
      framework: framework || 'unknown',
    }
  }

  // Kill any existing sandbox for this project
  await destroySandbox(projectId)

  const session: SandboxSession = {
    sandboxId: '',
    url: '',
    status: 'booting',
    createdAt: Date.now(),
    framework: framework || detectFramework(files),
  }

  let sandbox: Sandbox | undefined

  try {
    // Create sandbox VM — Vercel Sandbox starts in milliseconds
    sandbox = await Sandbox.create({
      runtime: 'node24',
      ports: [DEV_PORT],
      timeout: 300_000, // 5 minutes VM lifetime
    })

    session.sandboxId = sandbox.sandboxId
    activeSandboxes.set(projectId, { sandbox, session })

    // Write all project files in a single batch call
    session.status = 'writing'
    const fileEntries = Object.entries(files).map(([path, content]) => ({
      path: `${BASE_PATH}/${path}`,
      content: Buffer.from(content),
    }))
    await sandbox.writeFiles(fileEntries)

    // Install dependencies
    session.status = 'installing'
    const hasPackageJson = 'package.json' in files
    if (hasPackageJson) {
      const installResult = await sandbox.runCommand({
        cmd: 'npm',
        args: ['install'],
        cwd: BASE_PATH,
      })
      if (installResult.exitCode !== 0) {
        const stdout = typeof installResult.stdout === 'string' ? installResult.stdout : ''
        const stderr = typeof installResult.stderr === 'string' ? installResult.stderr : ''
        const output = stdout + '\n' + stderr
        throw new Error(`npm install failed (exit ${installResult.exitCode}): ${output.slice(-500)}`)
      }
    }

    // Start dev server in detached mode (runs in background)
    session.status = 'starting'
    const devCmd = getDevCommand(session.framework)
    const [cmd, ...args] = devCmd.split(' ')

    await sandbox.runCommand({
      cmd,
      args,
      cwd: BASE_PATH,
      detached: true,
    })

    // Wait briefly for server to bind to port
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Get public URL — domain() returns the HTTPS URL directly
    const domain = sandbox.domain(DEV_PORT)
    session.url = domain.startsWith('https://') ? domain : `https://${domain}`
    session.status = 'running'

    return { ...session, ok: true }
  } catch (error) {
    session.status = 'error'
    session.error = error instanceof Error ? error.message : 'Unknown error'

    // Clean up failed sandbox
    if (sandbox) {
      try {
        await sandbox.stop()
      } catch { /* ignore cleanup errors */ }
    }
    activeSandboxes.delete(projectId)

    return { ...session, ok: false }
  }
}

/**
 * Sync changed files to a running sandbox.
 */
export async function syncFiles(
  projectId: string,
  files: Record<string, string>,
): Promise<{ ok: boolean; synced: number; error?: string }> {
  const entry = activeSandboxes.get(projectId)
  if (!entry) return { ok: false, synced: 0, error: 'No active sandbox for this project' }

  try {
    const fileEntries = Object.entries(files).map(([path, content]) => ({
      path: `${BASE_PATH}/${path}`,
      content: Buffer.from(content),
    }))
    await entry.sandbox.writeFiles(fileEntries)
    return { ok: true, synced: fileEntries.length }
  } catch (error) {
    return { ok: false, synced: 0, error: error instanceof Error ? error.message : 'Sync failed' }
  }
}

/**
 * Destroy a sandbox and clean up.
 */
export async function destroySandbox(projectId: string): Promise<{ ok: boolean }> {
  const entry = activeSandboxes.get(projectId)
  if (entry) {
    try {
      await entry.sandbox.stop()
    } catch { /* already dead */ }
    activeSandboxes.delete(projectId)
  }
  return { ok: true }
}

/**
 * Get sandbox status for a project.
 */
export function getSandboxStatus(projectId: string): SandboxSession | null {
  const entry = activeSandboxes.get(projectId)
  if (!entry) return null
  return { ...entry.session }
}

/**
 * Check if Vercel Sandbox is configured.
 * On Vercel deployments: OIDC token is auto-provided.
 * Locally: needs `vercel env pull` to get VERCEL_OIDC_TOKEN.
 */
export function isVercelSandboxConfigured(): boolean {
  // SDK auto-resolves auth from these env vars
  return !!(
    (process.env.VERCEL_OIDC_TOKEN || '').trim() ||
    (process.env.VERCEL_TOKEN || '').trim() ||
    process.env.VERCEL // on Vercel platform, SDK authenticates automatically
  )
}

// ─── Helpers ────────────────────────────────────────────────────

function detectFramework(files: Record<string, string>): string {
  if (files['next.config.ts'] || files['next.config.js'] || files['next.config.mjs']) return 'nextjs'
  if (files['vite.config.ts'] || files['vite.config.js']) return 'vite'
  if (files['index.html'] && !files['src/main.tsx']) return 'static'
  if (files['app/page.tsx'] || files['app/page.jsx']) return 'nextjs'
  if (files['src/main.tsx'] || files['src/main.jsx']) return 'vite'
  return 'static'
}

function getDevCommand(framework: string): string {
  switch (framework) {
    case 'nextjs':
      return `npx next dev --port ${DEV_PORT} --hostname 0.0.0.0`
    case 'vite':
      return `npx vite --port ${DEV_PORT} --host 0.0.0.0`
    default:
      return `npx serve -l ${DEV_PORT} .`
  }
}
