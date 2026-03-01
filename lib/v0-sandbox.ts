import { createClient } from 'v0-sdk'

// ═══════════════════════════════════════════════════════════════════
// v0 Platform API Sandbox Manager — Production
//
// Uses v0's chats.init() (free, no tokens) to create instant preview
// sandboxes. Handles the 20-file-per-call limit by batching with
// chats.updateVersion(). Includes file filtering, delta sync,
// concurrency guards, session TTL, retry logic, and cleanup.
// ═══════════════════════════════════════════════════════════════════

// ─── Constants ──────────────────────────────────────────────────

const V0_FILE_LIMIT = 20
const MAX_FILE_SIZE = 128 * 1024     // 128KB per file
const MAX_TOTAL_SIZE = 4 * 1024 * 1024 // 4MB total payload
const SESSION_TTL_MS = 30 * 60 * 1000 // 30 min
const MAX_SESSIONS = 50
const MAX_RETRIES = 2
const POLL_MAX_ATTEMPTS = 12
const POLL_BASE_MS = 1500
const CREATE_TIMEOUT_MS = 60_000     // 60s total timeout on create
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 min periodic cleanup

// ─── File skip rules ────────────────────────────────────────────

const SKIP_EXACT = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
  '.gitignore', '.gitattributes',
  '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs', 'eslint.config.js', 'eslint.config.mjs',
  '.prettierrc', '.prettierrc.json', '.prettierrc.js',
  '.editorconfig',
  'tsconfig.node.json', 'tsconfig.build.json',
  '.env', '.env.local', '.env.production', '.env.development', '.env.test',
  'README.md', 'readme.md', 'CHANGELOG.md', 'LICENSE', 'LICENSE.md',
  '.npmrc', '.nvmrc', '.node-version',
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  '.dockerignore',
  'vercel.json',
  'jest.config.ts', 'jest.config.js', 'vitest.config.ts',
])

const SKIP_PREFIXES = [
  'node_modules/', '.git/', '.next/', 'dist/', 'build/', 'out/',
  '.vercel/', '.cache/', '.turbo/', '.husky/',
  '__tests__/', '__mocks__/', 'test/', 'tests/', 'coverage/',
  '.github/', '.vscode/',
]

const SKIP_EXTENSIONS = new Set([
  // Binary images/media
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.avif', '.bmp', '.tiff',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.avi', '.mov',
  '.zip', '.tar', '.gz', '.br', '.zst', '.7z', '.rar',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  // Source maps and declarations (v0 doesn't need them)
  '.map', '.d.ts', '.d.mts', '.d.cts',
  // Misc
  '.lock', '.log',
])

const SKIP_SUFFIXES = [
  '.test.ts', '.test.tsx', '.test.js', '.test.jsx',
  '.spec.ts', '.spec.tsx', '.spec.js', '.spec.jsx',
  '.stories.ts', '.stories.tsx', '.stories.js', '.stories.jsx',
]

// ─── Types ──────────────────────────────────────────────────────

export interface V0SandboxSession {
  chatId: string
  versionId: string
  demoUrl: string
  status: 'initializing' | 'running' | 'error'
  error?: string
  createdAt: number
  lastSyncedHash: string
  lastSyncedFiles: Record<string, number> // path → content length (for delta)
  fileCount: number
}

export interface CreateResult {
  ok: boolean
  demoUrl?: string
  chatId?: string
  versionId?: string
  status: string
  error?: string
  fileCount?: number
  skippedCount?: number
  retryable?: boolean
}

export interface SyncResult {
  ok: boolean
  synced: number
  demoUrl?: string
  error?: string
  retryable?: boolean
}

// ─── State ──────────────────────────────────────────────────────

const activeSessions = new Map<string, V0SandboxSession>()
const inflightOps = new Set<string>()

let _client: ReturnType<typeof createClient> | null = null
let _clientKey: string = ''

// Lazy cleanup: check on each public entry point instead of setInterval
let _lastSandboxCleanup = 0

function maybeCleanupSandboxSessions() {
  const now = Date.now()
  if (now - _lastSandboxCleanup > CLEANUP_INTERVAL_MS) {
    _lastSandboxCleanup = now
    evictStaleSessions()
  }
}

// ─── Client ─────────────────────────────────────────────────────

function getClient() {
  const apiKey = (process.env.V0_API_KEY || '').trim()
  if (!apiKey) throw new Error('V0_API_KEY not configured')
  // Invalidate if key changed (env var rotation)
  if (_client && _clientKey === apiKey) return _client
  _client = createClient({ apiKey })
  _clientKey = apiKey
  return _client
}

/** Reset client singleton (call on auth errors to force re-creation) */
function invalidateClient() {
  _client = null
  _clientKey = ''
}

// ─── File filtering & prioritization ────────────────────────────

function shouldSkipFile(name: string, content: string): boolean {
  if (SKIP_EXACT.has(name)) return true

  for (const prefix of SKIP_PREFIXES) {
    if (name.startsWith(prefix)) return true
  }

  // Check extension — handle extensionless files safely
  const dotIdx = name.lastIndexOf('.')
  if (dotIdx > 0) {
    const ext = name.substring(dotIdx).toLowerCase()
    if (SKIP_EXTENSIONS.has(ext)) return true
  }

  // Check test/story suffixes
  const lower = name.toLowerCase()
  for (const suffix of SKIP_SUFFIXES) {
    if (lower.endsWith(suffix)) return true
  }

  if (content.length > MAX_FILE_SIZE) return true
  if (content.trim().length === 0) return true

  return false
}

function prepareFiles(files: Record<string, string>): {
  prepared: Array<{ name: string; content: string }>
  skipped: number
  totalSize: number
} {
  let skipped = 0
  let totalSize = 0
  const prepared: Array<{ name: string; content: string }> = []

  for (const [rawName, content] of Object.entries(files)) {
    const name = rawName.replace(/\\/g, '/')

    if (shouldSkipFile(name, content)) {
      skipped++
      continue
    }

    if (totalSize + content.length > MAX_TOTAL_SIZE) {
      log(`Dropped "${name}" — total payload exceeds ${MAX_TOTAL_SIZE / 1024 / 1024}MB cap`)
      skipped++
      continue
    }

    totalSize += content.length
    prepared.push({ name, content })
  }

  prepared.sort((a, b) => filePriority(a.name) - filePriority(b.name))
  return { prepared, skipped, totalSize }
}

function filePriority(name: string): number {
  if (name === 'package.json') return 0
  if (name === 'tsconfig.json') return 1
  if (/^(next|vite)\.config\./.test(name)) return 2
  if (/^tailwind\.config\./.test(name)) return 3
  if (/^postcss\.config\./.test(name)) return 4
  if (name === 'components.json') return 5
  if (name === 'app/layout.tsx' || name === 'app/layout.jsx') return 10
  if (name === 'app/page.tsx' || name === 'app/page.jsx') return 11
  if (name === 'app/globals.css' || name === 'src/index.css') return 12
  if (name === 'src/App.tsx' || name === 'src/App.jsx') return 13
  if (name === 'src/main.tsx' || name === 'src/main.jsx') return 14
  if (name === 'index.html') return 15
  if (/^(app|src)\//.test(name)) return 20
  if (/^(components|lib|hooks|utils)\//.test(name)) return 30
  if (/^(styles|css)\//.test(name)) return 35
  if (name.startsWith('public/')) return 50
  return 40
}

// ─── Helpers ────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** Content-aware djb2 hash for change detection */
function hashFiles(files: Record<string, string>): string {
  const keys = Object.keys(files).sort()
  let h = 5381
  for (const k of keys) {
    // Hash key
    for (let i = 0; i < k.length; i++) h = ((h << 5) + h + k.charCodeAt(i)) | 0
    // Hash content (sample for performance: 5 zones of 250 chars each + length)
    const c = files[k]
    const mid = Math.max(0, Math.floor(c.length / 2) - 250)
    const q1 = Math.max(0, Math.floor(c.length / 4) - 125)
    const q3 = Math.max(0, Math.floor(c.length * 3 / 4) - 125)
    const sample = c.length <= 1500 ? c : c.substring(0, 250) + c.substring(q1, q1 + 250) + c.substring(mid, mid + 250) + c.substring(q3, q3 + 250) + c.substring(c.length - 250)
    for (let i = 0; i < sample.length; i++) h = ((h << 5) + h + sample.charCodeAt(i)) | 0
    h = ((h << 5) + h + c.length) | 0
  }
  return h.toString(36)
}

/** Build a path→length map for delta detection */
function buildFileIndex(files: Record<string, string>): Record<string, number> {
  const idx: Record<string, number> = {}
  for (const [k, v] of Object.entries(files)) idx[k.replace(/\\/g, '/')] = v.length
  return idx
}

/** Compute files that changed or were added since last sync */
function computeDelta(
  current: Record<string, string>,
  lastIndex: Record<string, number>,
): Record<string, string> {
  const delta: Record<string, string> = {}
  for (const [rawName, content] of Object.entries(current)) {
    const name = rawName.replace(/\\/g, '/')
    if (!(name in lastIndex) || lastIndex[name] !== content.length) {
      delta[rawName] = content
    }
  }
  return delta
}

function log(msg: string) {
  console.log(`[v0-sandbox] ${msg}`)
}

function isTransientError(err: unknown): boolean {
  if (!err) return false
  const msg = err instanceof Error ? err.message : String(err)
  return /429|500|502|503|504|ECONNRESET|ETIMEDOUT|fetch failed|network|socket hang up/i.test(msg)
}

function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /401|403|unauthorized|forbidden/i.test(msg)
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err

      if (isAuthError(err)) {
        invalidateClient()
        throw err
      }

      if (!isTransientError(err) || attempt === MAX_RETRIES) throw err

      const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 8000)
      log(`${label} attempt ${attempt + 1} failed, retry in ${Math.round(delay)}ms`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw lastError
}

/** Race a promise against a timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    promise.then(
      v => { clearTimeout(timer); resolve(v) },
      e => { clearTimeout(timer); reject(e) },
    )
  })
}

function evictStaleSessions() {
  const now = Date.now()
  const toDelete: string[] = []

  for (const [id, session] of activeSessions) {
    if (now - session.createdAt > SESSION_TTL_MS) toDelete.push(id)
  }

  if (toDelete.length === 0 && activeSessions.size <= MAX_SESSIONS) return

  // Best-effort cleanup
  let client: ReturnType<typeof createClient> | null = null
  try { client = getClient() } catch { /* no client = skip remote cleanup */ }

  for (const id of toDelete) {
    const session = activeSessions.get(id)
    activeSessions.delete(id)
    if (client && session?.chatId) {
      client.chats.delete({ chatId: session.chatId }).catch(() => {})
    }
  }

  // Enforce cap — evict oldest
  if (activeSessions.size > MAX_SESSIONS) {
    const sorted = [...activeSessions.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)
    const excess = sorted.slice(0, activeSessions.size - MAX_SESSIONS)
    for (const [id, session] of excess) {
      activeSessions.delete(id)
      if (client && session.chatId) {
        client.chats.delete({ chatId: session.chatId }).catch(() => {})
      }
    }
  }
}

// ─── Public API ─────────────────────────────────────────────────

export function isV0SandboxConfigured(): boolean {
  return !!(process.env.V0_API_KEY || '').trim()
}

export async function createV0Sandbox(
  projectId: string,
  files: Record<string, string>,
): Promise<CreateResult> {
  // Concurrency guard
  if (inflightOps.has(projectId)) {
    return { ok: false, status: 'error', error: 'Sandbox creation already in progress', retryable: true }
  }
  inflightOps.add(projectId)
  maybeCleanupSandboxSessions()

  try {
    return await withTimeout(
      _createV0SandboxInner(projectId, files),
      CREATE_TIMEOUT_MS,
      'createV0Sandbox',
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to create v0 sandbox'
    log(`Create failed: ${msg}`)

    const session = activeSessions.get(projectId)
    if (session) { session.status = 'error'; session.error = msg }

    return { ok: false, status: 'error', error: msg, retryable: isTransientError(error) }
  } finally {
    inflightOps.delete(projectId)
  }
}

async function _createV0SandboxInner(
  projectId: string,
  files: Record<string, string>,
): Promise<CreateResult> {
  evictStaleSessions()
  await destroyV0Sandbox(projectId)

  const { prepared, skipped, totalSize } = prepareFiles(files)

  if (prepared.length === 0) {
    return { ok: false, status: 'error', error: 'No uploadable files after filtering', skippedCount: skipped }
  }

  log(`create ${projectId}: ${prepared.length} files (${(totalSize / 1024).toFixed(1)}KB), ${skipped} skipped`)

  const session: V0SandboxSession = {
    chatId: '',
    versionId: '',
    demoUrl: '',
    status: 'initializing',
    createdAt: Date.now(),
    lastSyncedHash: hashFiles(files),
    lastSyncedFiles: buildFileIndex(files),
    fileCount: prepared.length,
  }

  const client = getClient()
  const initFiles = prepared.slice(0, V0_FILE_LIMIT)
  const overflowFiles = prepared.slice(V0_FILE_LIMIT)

  // Init chat
  const chat = await withRetry(
    () => client.chats.init({ type: 'files', files: initFiles, chatPrivacy: 'private' }),
    'chats.init',
  )

  session.chatId = chat.id
  session.versionId = chat.latestVersion?.id || ''
  session.demoUrl = chat.latestVersion?.demoUrl || ''
  session.status = session.demoUrl ? 'running' : 'initializing'
  activeSessions.set(projectId, session)

  log(`chat ${session.chatId} created, demoUrl: ${session.demoUrl ? 'yes' : 'pending'}`)

  // Overflow batches
  if (overflowFiles.length > 0 && session.chatId && session.versionId) {
    const batches = chunk(overflowFiles, V0_FILE_LIMIT)
    log(`${overflowFiles.length} overflow files in ${batches.length} batches`)

    for (let i = 0; i < batches.length; i++) {
      try {
        const version = await withRetry(
          () => client.chats.updateVersion({
            chatId: session.chatId,
            versionId: session.versionId,
            files: batches[i],
          }),
          `overflow ${i + 1}/${batches.length}`,
        )
        if (version.id) session.versionId = version.id
        if (version.demoUrl) { session.demoUrl = version.demoUrl; session.status = 'running' }
      } catch (err) {
        log(`overflow batch ${i + 1} failed: ${err instanceof Error ? err.message : err}`)
      }
    }
  }

  // Poll for demoUrl
  if (!session.demoUrl && session.versionId) {
    log('polling for demoUrl...')
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
      const delay = Math.min(POLL_BASE_MS * Math.pow(1.4, i), 8000)
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
          log('build failed')
          break
        }
      } catch (err) {
        log(`poll ${i + 1} error: ${err instanceof Error ? err.message : err}`)
        if (i >= 4) break
      }
    }
  }

  if (!session.demoUrl && session.status !== 'error') {
    session.status = 'error'
    session.error = 'Sandbox created but no preview URL after polling'
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
}

export async function syncV0Files(
  projectId: string,
  files: Record<string, string>,
): Promise<SyncResult> {
  maybeCleanupSandboxSessions()
  const session = activeSessions.get(projectId)
  if (!session) {
    return { ok: false, synced: 0, error: 'No active sandbox for this project' }
  }

  // Skip if nothing changed (content-aware hash)
  const currentHash = hashFiles(files)
  if (session.lastSyncedHash === currentHash) {
    return { ok: true, synced: 0, demoUrl: session.demoUrl }
  }

  // If errored, re-init
  if (session.status === 'error') {
    const result = await createV0Sandbox(projectId, files)
    return { ok: result.ok, synced: result.ok ? (result.fileCount || 0) : 0, demoUrl: result.demoUrl, error: result.error }
  }

  try {
    const client = getClient()

    // Delta sync: only send changed/added files
    const delta = computeDelta(files, session.lastSyncedFiles)
    const { prepared } = prepareFiles(delta)

    if (prepared.length === 0) {
      // Hash changed but no uploadable delta (could be skipped files changing)
      session.lastSyncedHash = currentHash
      session.lastSyncedFiles = buildFileIndex(files)
      return { ok: true, synced: 0, demoUrl: session.demoUrl }
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
            `sync ${i + 1}/${batches.length}`,
          )
          synced += batches[i].length
          if (version.id) session.versionId = version.id
          if (version.demoUrl) session.demoUrl = version.demoUrl
        }

        session.lastSyncedHash = currentHash
        session.lastSyncedFiles = buildFileIndex(files)
        session.fileCount = Object.keys(files).length
        log(`synced ${synced} changed files (delta)`)

        return { ok: true, synced, demoUrl: session.demoUrl }
      } catch (err) {
        log(`sync updateVersion failed: ${err instanceof Error ? err.message : err}`)
        if (isAuthError(err)) invalidateClient()
      }
    }

    // Fallback: full re-init
    const result = await createV0Sandbox(projectId, files)
    return { ok: result.ok, synced: result.ok ? (result.fileCount || 0) : 0, demoUrl: result.demoUrl, error: result.error }
  } catch (error) {
    return { ok: false, synced: 0, error: error instanceof Error ? error.message : 'Sync failed', retryable: isTransientError(error) }
  }
}

export async function destroyV0Sandbox(projectId: string): Promise<{ ok: boolean }> {
  const session = activeSessions.get(projectId)
  if (session?.chatId) {
    try {
      const client = getClient()
      await client.chats.delete({ chatId: session.chatId })
      log(`destroyed ${session.chatId}`)
    } catch { /* ignore */ }
  }
  activeSessions.delete(projectId)
  return { ok: true }
}

export function getV0SandboxStatus(projectId: string): (V0SandboxSession & { age: number }) | null {
  const session = activeSessions.get(projectId)
  if (!session) return null

  const age = Date.now() - session.createdAt
  if (age > SESSION_TTL_MS) {
    activeSessions.delete(projectId)
    return null
  }

  return { ...session, age }
}

export function getV0SandboxStats() {
  return {
    activeSessions: activeSessions.size,
    maxSessions: MAX_SESSIONS,
    inflightOps: inflightOps.size,
  }
}
