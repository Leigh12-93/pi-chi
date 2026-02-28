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
const MAX_FILE_SIZE = 128 * 1024  // 128KB per file — skip larger files
const MAX_TOTAL_SIZE = 4 * 1024 * 1024  // 4MB total payload guard
const SESSION_TTL_MS = 30 * 60 * 1000  // 30 minutes
const MAX_SESSIONS = 50  // bound memory
const MAX_RETRIES = 2
const POLL_MAX_ATTEMPTS = 15
const POLL_BASE_MS = 1500

// Files to always exclude — v0 handles its own npm install
const SKIP_FILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  '.gitignore',
  '.eslintrc.json',
  '.eslintrc.js',
  '.prettierrc',
  '.prettierrc.json',
  'tsconfig.node.json',
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
])

const SKIP_PREFIXES = [
  'node_modules/',
  '.git/',
  '.next/',
  'dist/',
  'build/',
  'out/',
  '.vercel/',
  '.cache/',
]

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp', '.avif',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp3', '.mp4', '.wav', '.ogg', '.webm',
  '.zip', '.tar', '.gz', '.br',
  '.pdf', '.doc', '.docx',
  '.exe', '.dll', '.so', '.dylib',
])

export interface V0SandboxSession {
  chatId: string
  versionId: string
  demoUrl: string
  status: 'initializing' | 'running' | 'error'
  error?: string
  createdAt: number
  lastSyncedHash?: string // track what was last synced for diff
  fileCount: number
}

// In-memory store — works per serverless instance
const activeSessions = new Map<string, V0SandboxSession>()

// Concurrency lock — prevent racing double-creates on same project
const inflightOps = new Set<string>()

// Singleton client — reuse across calls
let _client: ReturnType<typeof createClient> | null = null

function getClient() {
  if (_client) return _client
  const apiKey = (process.env.V0_API_KEY || '').trim()
  if (!apiKey) throw new Error('V0_API_KEY not configured')
  _client = createClient({ apiKey })
  return _client
}

// ─── File filtering & prioritization ─────────────────────────────

function shouldSkipFile(name: string, content: string): boolean {
  // Skip by exact name
  if (SKIP_FILES.has(name)) return true

  // Skip by prefix
  for (const prefix of SKIP_PREFIXES) {
    if (name.startsWith(prefix)) return true
  }

  // Skip binary files
  const ext = name.substring(name.lastIndexOf('.')).toLowerCase()
  if (BINARY_EXTENSIONS.has(ext)) return true

  // Skip oversized files
  if (content.length > MAX_FILE_SIZE) return true

  // Skip empty files
  if (content.trim().length === 0) return true

  return false
}

/**
 * Filter, prioritize, and prepare files for v0 upload.
 * Returns files sorted by importance, with junk filtered out.
 */
function prepareFiles(files: Record<string, string>): {
  prepared: Array<{ name: string; content: string }>
  skipped: number
  totalSize: number
} {
  let skipped = 0
  let totalSize = 0
  const prepared: Array<{ name: string; content: string }> = []

  for (const [name, content] of Object.entries(files)) {
    // Normalize path separators
    const normalized = name.replace(/\\/g, '/')

    if (shouldSkipFile(normalized, content)) {
      skipped++
      continue
    }

    // Guard total payload size
    if (totalSize + content.length > MAX_TOTAL_SIZE) {
      skipped++
      continue
    }

    totalSize += content.length
    prepared.push({ name: normalized, content })
  }

  // Sort by priority
  prepared.sort((a, b) => filePriority(a.name) - filePriority(b.name))

  return { prepared, skipped, totalSize }
}

function filePriority(name: string): number {
  if (name === 'package.json') return 0
  if (name === 'tsconfig.json') return 1
  if (name.match(/^(next|vite)\.config\./)) return 2
  if (name === 'tailwind.config.ts' || name === 'tailwind.config.js') return 3
  if (name === 'postcss.config.mjs' || name === 'postcss.config.js') return 4
  if (name === 'components.json') return 5
  if (name === 'app/layout.tsx' || name === 'app/layout.jsx') return 10
  if (name === 'app/page.tsx' || name === 'app/page.jsx') return 11
  if (name === 'app/globals.css' || name === 'src/index.css') return 12
  if (name === 'src/App.tsx' || name === 'src/App.jsx') return 13
  if (name === 'src/main.tsx' || name === 'src/main.jsx') return 14
  if (name === 'index.html') return 15
  if (name.match(/^(app|src)\//)) return 20
  if (name.match(/^(components|lib|hooks|utils)\//)) return 30
  if (name.match(/^(styles|css)\//)) return 35
  if (name.startsWith('public/')) return 50
  return 40
}

// ─── Helpers ─────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

/** Simple hash for change detection */
function hashFiles(files: Record<string, string>): string {
  const keys = Object.keys(files).sort()
  let h = 0
  for (const k of keys) {
    const s = k + ':' + files[k].length
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0
    }
  }
  return h.toString(36)
}

function log(msg: string) {
  console.log(`[v0-sandbox] ${msg}`)
}

/** Retry a function with exponential backoff on transient errors */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      const msg = err instanceof Error ? err.message : String(err)
      const isTransient = msg.includes('429') || msg.includes('500') ||
        msg.includes('502') || msg.includes('503') || msg.includes('ECONNRESET') ||
        msg.includes('fetch failed') || msg.includes('network')

      if (!isTransient || attempt === MAX_RETRIES) throw err

      const delay = Math.min(1000 * Math.pow(2, attempt), 8000)
      log(`${label} failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms: ${msg}`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw lastError
}

/** Evict expired sessions + enforce max cap */
function evictStaleSessions() {
  const now = Date.now()
  for (const [id, session] of activeSessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      activeSessions.delete(id)
      // Best-effort cleanup — don't await
      try {
        const client = getClient()
        client.chats.delete({ chatId: session.chatId }).catch(() => {})
      } catch { /* ignore */ }
    }
  }

  // If still over cap, evict oldest
  if (activeSessions.size > MAX_SESSIONS) {
    const sorted = [...activeSessions.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)
    const toEvict = sorted.slice(0, activeSessions.size - MAX_SESSIONS)
    for (const [id, session] of toEvict) {
      activeSessions.delete(id)
      try {
        const client = getClient()
        client.chats.delete({ chatId: session.chatId }).catch(() => {})
      } catch { /* ignore */ }
    }
  }
}

// ─── Public API ──────────────────────────────────────────────────

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
): Promise<{
  ok: boolean
  demoUrl?: string
  chatId?: string
  versionId?: string
  status: string
  error?: string
  fileCount?: number
  skippedCount?: number
}> {
  // Concurrency guard
  if (inflightOps.has(projectId)) {
    return { ok: false, status: 'error', error: 'Sandbox creation already in progress' }
  }
  inflightOps.add(projectId)

  try {
    // Evict stale sessions before creating new one
    evictStaleSessions()

    // Destroy any existing sandbox for this project
    await destroyV0Sandbox(projectId)

    // Filter and prioritize files
    const { prepared, skipped, totalSize } = prepareFiles(files)

    if (prepared.length === 0) {
      return { ok: false, status: 'error', error: 'No uploadable files after filtering', skippedCount: skipped }
    }

    log(`Creating sandbox: ${prepared.length} files (${(totalSize / 1024).toFixed(1)}KB), ${skipped} skipped`)

    const session: V0SandboxSession = {
      chatId: '',
      versionId: '',
      demoUrl: '',
      status: 'initializing',
      createdAt: Date.now(),
      lastSyncedHash: hashFiles(files),
      fileCount: prepared.length,
    }

    const client = getClient()

    // Split into init batch (first 20) + overflow batches
    const initFiles = prepared.slice(0, V0_FILE_LIMIT)
    const overflowFiles = prepared.slice(V0_FILE_LIMIT)

    // Init chat with first batch (with retry)
    const chat = await withRetry(
      () => client.chats.init({
        type: 'files',
        files: initFiles,
        chatPrivacy: 'private',
      }),
      'chats.init',
    )

    session.chatId = chat.id
    session.versionId = chat.latestVersion?.id || ''
    session.demoUrl = chat.latestVersion?.demoUrl || ''
    session.status = session.demoUrl ? 'running' : 'initializing'

    activeSessions.set(projectId, session)

    log(`Chat created: ${session.chatId}, version: ${session.versionId}, demoUrl: ${session.demoUrl ? 'yes' : 'pending'}`)

    // Upload overflow files in batches of 20 via updateVersion
    if (overflowFiles.length > 0 && session.chatId && session.versionId) {
      const batches = chunk(overflowFiles, V0_FILE_LIMIT)
      log(`Uploading ${overflowFiles.length} overflow files in ${batches.length} batches`)

      for (let i = 0; i < batches.length; i++) {
        try {
          const version = await withRetry(
            () => client.chats.updateVersion({
              chatId: session.chatId,
              versionId: session.versionId,
              files: batches[i],
            }),
            `updateVersion batch ${i + 1}/${batches.length}`,
          )
          if (version.id) session.versionId = version.id
          if (version.demoUrl) {
            session.demoUrl = version.demoUrl
            session.status = 'running'
          }
        } catch (err) {
          // Log but don't fail — partial upload is better than none
          log(`Overflow batch ${i + 1} failed: ${err instanceof Error ? err.message : err}`)
        }
      }
    }

    // If no demoUrl yet, poll with exponential backoff
    if (!session.demoUrl && session.versionId) {
      log('Polling for demoUrl...')
      for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
        const delay = Math.min(POLL_BASE_MS * Math.pow(1.5, i), 10000)
        await new Promise(r => setTimeout(r, delay))
        try {
          const updated = await client.chats.getById({ chatId: session.chatId })
          const v = updated.latestVersion
          if (v?.demoUrl) {
            session.demoUrl = v.demoUrl
            session.versionId = v.id
            session.status = 'running'
            log(`demoUrl ready after ${i + 1} polls`)
            break
          }
          if (v?.status === 'failed') {
            session.status = 'error'
            session.error = 'v0 sandbox build failed'
            log('Sandbox build failed')
            break
          }
        } catch (err) {
          log(`Poll ${i + 1} error: ${err instanceof Error ? err.message : err}`)
          if (i >= 3) break // give up after repeated poll failures
        }
      }
    }

    if (!session.demoUrl && session.status !== 'error') {
      session.status = 'error'
      session.error = 'Sandbox created but no preview URL available after polling'
    }

    return {
      ok: session.status === 'running',
      demoUrl: session.demoUrl || undefined,
      chatId: session.chatId,
      versionId: session.versionId,
      status: session.status,
      error: session.error,
      fileCount: prepared.length,
      skippedCount: skipped,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to create v0 sandbox'
    log(`Create failed: ${msg}`)

    const session = activeSessions.get(projectId)
    if (session) {
      session.status = 'error'
      session.error = msg
    }

    return { ok: false, status: 'error', error: msg }
  } finally {
    inflightOps.delete(projectId)
  }
}

/**
 * Sync files to a running v0 sandbox.
 * Only sends files that changed since last sync (diff-based).
 * Uses chats.updateVersion() in batches of 20.
 * Falls back to re-init if updateVersion fails.
 */
export async function syncV0Files(
  projectId: string,
  files: Record<string, string>,
): Promise<{ ok: boolean; synced: number; demoUrl?: string; error?: string }> {
  const session = activeSessions.get(projectId)
  if (!session) {
    return { ok: false, synced: 0, error: 'No active sandbox for this project' }
  }

  // Skip if nothing changed
  const currentHash = hashFiles(files)
  if (session.lastSyncedHash === currentHash) {
    return { ok: true, synced: 0, demoUrl: session.demoUrl }
  }

  // If session is in error state, try re-init
  if (session.status === 'error') {
    const result = await createV0Sandbox(projectId, files)
    return {
      ok: result.ok,
      synced: result.ok ? (result.fileCount || 0) : 0,
      demoUrl: result.demoUrl,
      error: result.error,
    }
  }

  try {
    const client = getClient()

    // Filter files the same way as create
    const { prepared } = prepareFiles(files)
    if (prepared.length === 0) {
      return { ok: false, synced: 0, error: 'No uploadable files after filtering' }
    }

    if (session.chatId && session.versionId) {
      try {
        const batches = chunk(prepared, V0_FILE_LIMIT)
        let synced = 0

        for (let i = 0; i < batches.length; i++) {
          const version = await withRetry(
            () => client.chats.updateVersion({
              chatId: session.chatId,
              versionId: session.versionId,
              files: batches[i],
            }),
            `sync batch ${i + 1}/${batches.length}`,
          )
          synced += batches[i].length
          if (version.id) session.versionId = version.id
          if (version.demoUrl) session.demoUrl = version.demoUrl
        }

        session.lastSyncedHash = currentHash
        session.fileCount = prepared.length
        log(`Synced ${synced} files`)

        return { ok: true, synced, demoUrl: session.demoUrl }
      } catch (err) {
        log(`updateVersion sync failed: ${err instanceof Error ? err.message : err}, falling back to re-init`)
      }
    }

    // Fallback: re-init creates a new chat (init is free)
    const result = await createV0Sandbox(projectId, files)
    return {
      ok: result.ok,
      synced: result.ok ? (result.fileCount || 0) : 0,
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
      log(`Destroyed sandbox ${session.chatId}`)
    } catch { /* ignore cleanup errors */ }
  }
  activeSessions.delete(projectId)
  return { ok: true }
}

/**
 * Get sandbox status for a project.
 */
export function getV0SandboxStatus(projectId: string): (V0SandboxSession & { age: number }) | null {
  const session = activeSessions.get(projectId)
  if (!session) return null

  // Check if expired
  const age = Date.now() - session.createdAt
  if (age > SESSION_TTL_MS) {
    activeSessions.delete(projectId)
    return null
  }

  return { ...session, age }
}

/**
 * Get aggregate stats about active sessions.
 */
export function getV0SandboxStats(): {
  activeSessions: number
  maxSessions: number
  inflightOps: number
} {
  return {
    activeSessions: activeSessions.size,
    maxSessions: MAX_SESSIONS,
    inflightOps: inflightOps.size,
  }
}
