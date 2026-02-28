import { createClient } from 'v0-sdk'

// ═══════════════════════════════════════════════════════════════════
// v0 Platform API Sandbox Manager
// Uses v0's chats.init() to create instant preview sandboxes.
// Free (no tokens consumed), uploads files to Vercel Sandbox VM,
// returns a demoUrl for iframe embedding.
// ═══════════════════════════════════════════════════════════════════

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
 * Check if v0 sandbox is configured (V0_API_KEY env var present).
 */
export function isV0SandboxConfigured(): boolean {
  return !!(process.env.V0_API_KEY || '').trim()
}

/**
 * Create a v0 sandbox by initializing a chat with files.
 * chats.init({ type: 'files', files }) is FREE — no tokens consumed.
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

    // Convert Record<path, content> to v0 file format
    const v0Files = Object.entries(files).map(([name, content]) => ({
      name,
      content,
    }))

    const chat = await client.chats.init({
      type: 'files',
      files: v0Files,
      chatPrivacy: 'private',
    })

    session.chatId = chat.id
    session.versionId = chat.latestVersion?.id || ''
    session.demoUrl = chat.latestVersion?.demoUrl || ''
    session.status = session.demoUrl ? 'running' : 'initializing'

    activeSessions.set(projectId, session)

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
 * Uses chats.updateVersion() to update files in-place.
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
    const v0Files = Object.entries(files).map(([name, content]) => ({
      name,
      content,
    }))

    // Try updateVersion first (updates files in-place, keeps same demoUrl)
    if (session.chatId && session.versionId) {
      try {
        const version = await client.chats.updateVersion({
          chatId: session.chatId,
          versionId: session.versionId,
          files: v0Files,
        })

        if (version.demoUrl) {
          session.demoUrl = version.demoUrl
        }

        return {
          ok: true,
          synced: v0Files.length,
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
