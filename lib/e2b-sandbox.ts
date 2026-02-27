import { Sandbox } from '@e2b/sdk'

// ═══════════════════════════════════════════════════════════════════
// E2B Sandbox Manager
// Manages ephemeral Linux VMs for live project preview
// ═══════════════════════════════════════════════════════════════════

const E2B_API_KEY = (process.env.E2B_API_KEY || '').trim()

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

const BASE_PATH = '/home/user/app'
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
  if (!E2B_API_KEY) {
    return {
      ok: false,
      sandboxId: '',
      url: '',
      status: 'error',
      error: 'E2B_API_KEY not configured. Sign up at e2b.dev and add the key to your environment.',
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

  let sandbox: Sandbox

  try {
    // Create sandbox VM with longer timeout for initial creation
    const createTimeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Sandbox creation timed out after 60 seconds')), 60000)
    })

    sandbox = await Promise.race([
      Sandbox.create({
        apiKey: E2B_API_KEY,
        timeout: 300, // 5 minutes VM lifetime
      }),
      createTimeout
    ])

    session.sandboxId = sandbox.id
    activeSandboxes.set(projectId, { sandbox, session })

    // Write all project files
    session.status = 'writing'
    for (const [path, content] of Object.entries(files)) {
      await sandbox.filesystem.write(`${BASE_PATH}/${path}`, content)
    }

    // Install dependencies
    session.status = 'installing'
    const hasPackageJson = 'package.json' in files
    if (hasPackageJson) {
      const installResult = await sandbox.process.startAndWait({
        cmd: 'cd ' + BASE_PATH + ' && npm install 2>&1',
        timeout: 120, // 2 minutes
      })
      if (installResult.exitCode !== 0) {
        const output = installResult.stdout + '\n' + installResult.stderr
        throw new Error(`npm install failed (exit ${installResult.exitCode}): ${output.slice(-500)}`)
      }
    }

    // Start dev server (fire and forget — runs in background)
    session.status = 'starting'
    const devCmd = getDevCommand(session.framework)

    sandbox.process.start({
      cmd: `cd ${BASE_PATH} && ${devCmd}`,
    }).catch(() => { /* server process — ignore when killed */ })

    // Wait for server to boot with health check
    await waitForServer(sandbox, DEV_PORT)

    // Get public URL
    const hostname = sandbox.getHostname(DEV_PORT)
    session.url = `https://${hostname}`
    session.status = 'running'

    return { ...session, ok: true }
  } catch (error) {
    session.status = 'error'
    session.error = error instanceof Error ? error.message : 'Unknown error'
    
    // Clean up failed sandbox
    if (sandbox) {
      try {
        await sandbox.close()
      } catch { /* ignore cleanup errors */ }
    }
    activeSandboxes.delete(projectId)
    
    return { ...session, ok: false }
  }
}

/**
 * Wait for dev server to be ready by checking if port is listening
 */
async function waitForServer(sandbox: Sandbox, port: number, maxWaitMs = 30000): Promise<void> {
  const startTime = Date.now()
  
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const result = await sandbox.process.startAndWait({
        cmd: `curl -s -o /dev/null -w "%{http_code}" http://localhost:${port} || echo "000"`,
        timeout: 5,
      })
      
      const httpCode = result.stdout.trim()
      if (httpCode !== '000' && httpCode !== '502' && httpCode !== '503') {
        // Server is responding (even if with errors like 404, that's fine)
        return
      }
    } catch {
      // Curl failed, server not ready yet
    }
    
    // Wait 2 seconds before next check
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  
  throw new Error('Dev server failed to start within 30 seconds')
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
    let count = 0
    for (const [path, content] of Object.entries(files)) {
      await entry.sandbox.filesystem.write(`${BASE_PATH}/${path}`, content)
      count++
    }
    return { ok: true, synced: count }
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
      await entry.sandbox.close()
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
 * Check if E2B is configured.
 */
export function isE2BConfigured(): boolean {
  return !!E2B_API_KEY
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