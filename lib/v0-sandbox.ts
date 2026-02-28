import { createClient } from 'v0-sdk'

// ═══════════════════════════════════════════════════════════════════
// v0 Platform API Sandbox Manager
// Uses v0's chats.init() to create instant preview sandboxes.
// Free (no tokens consumed), uploads files to Vercel Sandbox VM,
// returns a demoUrl for iframe embedding.
//
// v0 limits chats.init() to 20 files per call. For larger projects,
// we init with the 20 highest-priority files then batch the rest
// via chats.updateVersion() in chunks of 20.
// ═══════════════════════════════════════════════════════════════════

const V0_FILE_LIMIT = 20

export interface V0SandboxSession {
  chatId: string
  versionId: string
  demoUrl: string
  status: 'initializing' | 'running' | 'error'
  error?: string
  createdAt: number
}

// In-memory store — works per serverless instance
const activeSessions = new Map<string, V0SandboxSession>()

function getClient() {
  const apiKey = (process.env.V0_API_KEY || '').trim()
  if (!apiKey) throw new Error('V0_API_KEY not configured')
  return createClient({ apiKey })
}

/**
 * Prioritize files so the most critical ones go in the init batch.
 * Config + entry points first, then components, then everything else.
 */
function prioritizeFiles(files: Record<string, string>): Array<{ name: string; content: string }> {
  const entries = Object.entries(files).map(([name, content]) => ({ name, content }))

  const priority = (name: string): number => {
    if (name === 'package.json') return 0
    if (name === 'tsconfig.json') return 1
    if (name.match(/^(next|vite)\.config\./)) return 2
    if (name === 'tailwind.config.ts' || name === 'tailwind.config.js') return 3
    if (name === 'postcss.config.mjs' || name === 'postcss.config.js') return 4
    if (name === 'app/layout.tsx' || name === 'app/layout.jsx') return 5
    if (name === 'app/page.tsx' || name === 'app/page.jsx') return 6
    if (name === 'app/globals.css' || name === 'src/index.css') return 7
    if (name === 'src/App.tsx' || name === 'src/App.jsx') return 8
    if (name === 'src/main.tsx' || name === 'src/main.jsx') return 9
    if (name === 'index.html') return 10
    if (name.startsWith('app/') || name.startsWith('src/')) return 20
    if (name.startsWith('components/') || name.startsWith('lib/')) return 30
    if (name.startsWith('public/')) return 50
    return 40
  }

  return entries.sort((a, b) => priority(a.name) - priority(b.name))
}

/**
 * Split an array into chunks of a given size.
 */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

/**
 * Check if v0 sandbox is configured (V0_API_KEY env var present).
 */
export function isV0SandboxConfigured(): boolean {
  return !!(process.env.V0_API_KEY || '').trim()
}

/**
 * Create a v0 sandbox by initializing a chat with files.
 * chats.init({ type: 'files', files }) is FREE — no tokens consumed.
 * If >20 files, inits with the top 20 then batches the rest via updateVersion.
 */
export async function createV0Sandbox(
  projectId: string,
  files: Record<string, string>,
): Promise<{ ok: boolean; demoUrl?: string; chatId?: string; versionId?: string; status: string; error?: string }> {
  // Destroy any existing sandbox for this project
  await destroyV0Sandbox(projectId)

  const session: V0SandboxSession = {
    chatId: '',
    versionId: '',
    demoUrl: '',
    status: 'initializing',
    createdAt: Date.now(),
  }

  try {
    const client = getClient()

    // Prioritize and split files into init batch + overflow batches
    const sorted = prioritizeFiles(files)
    const initFiles = sorted.slice(0, V0_FILE_LIMIT)
    const overflowFiles = sorted.slice(V0_FILE_LIMIT)

    const chat = await client.chats.init({
      type: 'files',
      files: initFiles,
      chatPrivacy: 'private',
    })

    session.chatId = chat.id
    session.versionId = chat.latestVersion?.id || ''
    session.demoUrl = chat.latestVersion?.demoUrl || ''
    session.status = session.demoUrl ? 'running' : 'initializing'

    activeSessions.set(projectId, session)

    // Upload overflow files in batches of 20 via updateVersion
    if (overflowFiles.length > 0 && session.chatId && session.versionId) {
      const batches = chunk(overflowFiles, V0_FILE_LIMIT)
      for (const batch of batches) {
        try {
          const version = await client.chats.updateVersion({
            chatId: session.chatId,
            versionId: session.versionId,
            files: batch,
          })
          if (version.id) session.versionId = version.id
          if (version.demoUrl) {
            session.demoUrl = version.demoUrl
            session.status = 'running'
          }
        } catch (err) {
          // Log but don't fail — partial upload is better than none
          console.error('[v0-sandbox] overflow batch failed:', err)
        }
      }
    }

    // If no demoUrl yet, poll briefly (version may still be building)
    if (!session.demoUrl && session.versionId) {
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 2000))
        try {
          const updated = await client.chats.getById({ chatId: session.chatId })
          if (updated.latestVersion?.demoUrl) {
            session.demoUrl = updated.latestVersion.demoUrl
            session.status = 'running'
            break
          }
          if (updated.latestVersion?.status === 'failed') {
            session.status = 'error'
            session.error = 'v0 sandbox build failed'
            break
          }
        } catch { break }
      }
    }

    if (!session.demoUrl && session.status !== 'error') {
      session.status = 'error'
      session.error = 'Sandbox created but no preview URL available'
    }

    return {
      ok: session.status === 'running',
      demoUrl: session.demoUrl || undefined,
      chatId: session.chatId,
      versionId: session.versionId,
      status: session.status,
      error: session.error,
    }
  } catch (error) {
    session.status = 'error'
    session.error = error instanceof Error ? error.message : 'Failed to create v0 sandbox'
    activeSessions.set(projectId, session)

    return {
      ok: false,
      status: 'error',
      error: session.error,
    }
  }
}

/**
 * Sync files to a running v0 sandbox.
 * Uses chats.updateVersion() in batches of 20.
 * Falls back to re-init if updateVersion fails.
 */
export async function syncV0Files(
  projectId: string,
  files: Record<string, string>,
): Promise<{ ok: boolean; synced: number; demoUrl?: string; error?: string }> {
  const session = activeSessions.get(projectId)
  if (!session || session.status === 'error') {
    return { ok: false, synced: 0, error: 'No active sandbox for this project' }
  }

  try {
    const client = getClient()
    const v0Files = Object.entries(files).map(([name, content]) => ({ name, content }))

    if (session.chatId && session.versionId) {
      try {
        const batches = chunk(v0Files, V0_FILE_LIMIT)
        let synced = 0

        for (const batch of batches) {
          const version = await client.chats.updateVersion({
            chatId: session.chatId,
            versionId: session.versionId,
            files: batch,
          })
          synced += batch.length
          if (version.id) session.versionId = version.id
          if (version.demoUrl) session.demoUrl = version.demoUrl
        }

        return {
          ok: true,
          synced,
          demoUrl: session.demoUrl,
        }
      } catch {
        // updateVersion failed — fall back to re-init
      }
    }

    // Fallback: re-init creates a new chat (init is free)
    const result = await createV0Sandbox(projectId, files)
    return {
      ok: result.ok,
      synced: result.ok ? v0Files.length : 0,
      demoUrl: result.demoUrl,
      error: result.error,
    }
  } catch (error) {
    return {
      ok: false,
      synced: 0,
      error: error instanceof Error ? error.message : 'Sync failed',
    }
  }
}

/**
 * Destroy a v0 sandbox and clean up.
 */
export async function destroyV0Sandbox(projectId: string): Promise<{ ok: boolean }> {
  const session = activeSessions.get(projectId)
  if (session?.chatId) {
    try {
      const client = getClient()
      await client.chats.delete({ chatId: session.chatId })
    } catch { /* ignore cleanup errors */ }
  }
  activeSessions.delete(projectId)
  return { ok: true }
}

/**
 * Get sandbox status for a project.
 */
export function getV0SandboxStatus(projectId: string): V0SandboxSession | null {
  const session = activeSessions.get(projectId)
  if (!session) return null
  return { ...session }
}
