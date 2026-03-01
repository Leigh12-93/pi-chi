import { streamText, tool, convertToCoreMessages, StreamData } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { SYSTEM_PROMPT } from '@/lib/system-prompt'
import { mcpClient } from '@/lib/mcp-client'
import { createV0Sandbox, getV0SandboxStatus, destroyV0Sandbox } from '@/lib/v0-sandbox'
import { chatLimiter } from '@/lib/rate-limit'
import { TaskStore } from '@/lib/background-tasks'
import { getSession } from '@/lib/auth'
import { TEMPLATES, type TemplateName } from '@/lib/templates'

// ═══════════════════════════════════════════════════════════════════
// Virtual Filesystem — lives in closure per request
// ═══════════════════════════════════════════════════════════════════

class VirtualFS {
  files: Map<string, string>

  /** Sanitize a file path — block traversal, normalize separators */
  static sanitizePath(path: string): string | null {
    // Normalize separators
    let p = path.replace(/\\/g, '/').trim()
    // Remove leading slash
    if (p.startsWith('/')) p = p.slice(1)
    // Block traversal
    if (p.includes('..') || p.includes('\0')) return null
    // Block absolute paths (C:, /etc)
    if (/^[a-zA-Z]:/.test(p)) return null
    // Block empty
    if (!p) return null
    return p
  }

  constructor(initial?: Record<string, string>) {
    this.files = new Map(Object.entries(initial || {}))
  }

  write(path: string, content: string) {
    const safe = VirtualFS.sanitizePath(path)
    if (!safe) return
    this.files.set(safe, content)
  }

  read(path: string): string | undefined {
    const safe = VirtualFS.sanitizePath(path)
    return safe ? this.files.get(safe) : undefined
  }

  exists(path: string): boolean {
    const safe = VirtualFS.sanitizePath(path)
    return safe ? this.files.has(safe) : false
  }

  delete(path: string): boolean {
    const safe = VirtualFS.sanitizePath(path)
    return safe ? this.files.delete(safe) : false
  }

  list(prefix = ''): string[] {
    return Array.from(this.files.keys())
      .filter(k => !prefix || k.startsWith(prefix))
      .sort()
  }

  search(pattern: string, maxResults = 30): Array<{ file: string; line: number; text: string }> | { error: string } {
    const results: Array<{ file: string; line: number; text: string }> = []
    let regex: RegExp
    try {
      regex = new RegExp(pattern, 'i')
    } catch (_e) {
      return { error: `Invalid regex pattern: ${pattern}` }
    }
    for (const [path, content] of this.files) {
      if (results.length >= maxResults) break
      const lines = content.split('\n')
      for (let i = 0; i < lines.length && results.length < maxResults; i++) {
        if (regex.test(lines[i])) {
          results.push({ file: path, line: i + 1, text: lines[i].trim().slice(0, 200) })
        }
      }
    }
    return results
  }

  toRecord(): Record<string, string> {
    return Object.fromEntries(this.files)
  }

  manifest(): Array<{ path: string; lines: number; size: number }> {
    return Array.from(this.files.entries())
      .map(([path, content]) => ({
        path,
        lines: content.split('\n').length,
        size: content.length,
      }))
      .sort((a, b) => a.path.localeCompare(b.path))
  }

  toTree(): TreeNode[] {
    const root: TreeNode[] = []
    for (const path of this.list()) {
      const parts = path.split('/')
      let current = root
      for (let i = 0; i < parts.length; i++) {
        const name = parts[i]
        const isFile = i === parts.length - 1
        const existingDir = current.find(n => n.name === name && n.type === 'directory')
        if (isFile) {
          current.push({ name, path, type: 'file' })
        } else if (existingDir) {
          current = existingDir.children!
        } else {
          const dir: TreeNode = { name, path: parts.slice(0, i + 1).join('/'), type: 'directory', children: [] }
          current.push(dir)
          current = dir.children!
        }
      }
    }
    return sortTree(root)
  }
}

interface TreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: TreeNode[]
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  }).map(n => n.children ? { ...n, children: sortTree(n.children) } : n)
}

// ═══════════════════════════════════════════════════════════════════
// GitHub API helpers
// ═══════════════════════════════════════════════════════════════════

const GITHUB_TOKEN = (process.env.GITHUB_TOKEN || '').trim()
const GITHUB_API = 'https://api.github.com'

async function githubFetch(path: string, token: string, options: RequestInit = {}) {
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 30000)
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    signal: ctrl.signal,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  clearTimeout(timeout)
  // Detect rate limiting
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get('x-ratelimit-remaining')
    const resetAt = res.headers.get('x-ratelimit-reset')
    if (remaining === '0' || res.status === 429) {
      const resetMin = resetAt ? Math.ceil((parseInt(resetAt) * 1000 - Date.now()) / 60000) : 0
      return { error: `GitHub API rate limited. Try again${resetMin > 0 ? ` in ~${resetMin} minute${resetMin > 1 ? 's' : ''}` : ' later'}.`, status: res.status, rateLimited: true }
    }
  }
  const data = await res.json()
  if (!res.ok) return { error: data.message || `GitHub API ${res.status}`, status: res.status }
  return data
}

// ═══════════════════════════════════════════════════════════════════
// Vercel Deploy API helpers
// ═══════════════════════════════════════════════════════════════════

const VERCEL_TOKEN = (process.env.FORGE_DEPLOY_TOKEN || process.env.VERCEL_TOKEN || '').trim()
const VERCEL_TEAM = process.env.VERCEL_TEAM_ID || ''

/** Run async operations in parallel batches */
async function batchParallel<T, R>(items: T[], batchSize: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    results.push(...await Promise.all(batch.map(fn)))
  }
  return results
}

function detectFramework(files: Record<string, string>): string | undefined {
  if (files['next.config.ts'] || files['next.config.js'] || files['next.config.mjs']) return 'nextjs'
  if (files['vite.config.ts'] || files['vite.config.js'] || files['vite.config.mjs']) return 'vite'
  if (files['nuxt.config.ts'] || files['nuxt.config.js']) return 'nuxtjs'
  if (files['astro.config.mjs'] || files['astro.config.ts']) return 'astro'
  if (files['svelte.config.js'] || files['svelte.config.ts']) return 'sveltekit'
  if (files['remix.config.js'] || files['remix.config.ts']) return 'remix'
  return undefined // let Vercel auto-detect for static sites
}

async function vercelDeploy(name: string, files: Record<string, string>, framework?: string, onProgress?: (msg: string) => Promise<void>, envVars?: Record<string, string>) {
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

  await progress('Finalizing...')
  return { url: deployUrl, id: deployId, readyState: state, framework: fw, fileCount: Object.keys(files).length }
}

// ═══════════════════════════════════════════════════════════════════
// Supabase DB credentials (for the AI's database tools)
// ═══════════════════════════════════════════════════════════════════

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

async function supabaseFetch(path: string, options: RequestInit = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { data: null, status: 500, ok: false }
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers,
    },
  })
  const text = await res.text()
  try {
    return { data: JSON.parse(text), status: res.status, ok: res.ok }
  } catch {
    return { data: text, status: res.status, ok: res.ok }
  }
}


// System prompt imported from lib/system-prompt.ts


// ═══════════════════════════════════════════════════════════════════
// POST handler
// ═══════════════════════════════════════════════════════════════════

export async function POST(req: Request) {
  // Rate limit — 20 requests/minute per IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')?.trim()
    || req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown'
  const limit = chatLimiter(ip)
  if (!limit.ok) {
    return new Response(JSON.stringify({ error: 'Rate limited. Try again in a minute.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(limit.resetIn / 1000)) },
    })
  }

  // Auth check — prevent unauthenticated access to the AI endpoint
  const session = await getSession()
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Authentication required. Please sign in with GitHub.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Request body size guard: reject payloads over 8MB to prevent abuse
  const contentLength = parseInt(req.headers.get('content-length') || '0', 10)
  if (contentLength > 8 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: 'Request too large. Maximum body size is 8MB.' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const body = await req.json()
  const projectName = body.projectName || 'untitled'
  const projectId = body.projectId || null
  const selectedModel = body.model || 'claude-sonnet-4-20250514'

  // Use GitHub token from session (not request body) — prevents token leaking via logs
  const effectiveGithubToken = session.accessToken || GITHUB_TOKEN

  // Env vars from client (user-provided via request_env_vars card)
  const clientEnvVars: Record<string, string> = body.envVars && typeof body.envVars === 'object' ? body.envVars : {}

  // Initialize virtual FS from client state
  const vfs = new VirtualFS(body.files || {})

  // In-request task store for background operations
  const taskStore = new TaskStore()

  // Track edit_file failures per path — after 3 failures, suggest write_file
  const editFailCounts = new Map<string, number>()

  // Build file manifest for system context (lean — no content)
  const manifest = vfs.manifest()
  const manifestStr = manifest.length > 0
    ? manifest.map(f => `  ${f.path} (${f.lines}L, ${(f.size / 1024).toFixed(1)}kb)`).join('\n')
    : '  (empty project)'

  // ── Cost optimization: trim conversation history ──────────────
  // Tool invocations in old messages contain full file contents (write_file args)
  // that get re-sent every request. Use 3-tier trimming:
  //   Last 4 messages: full detail (complete tool data)
  //   Messages 5-8: medium detail (tool names + paths only, stripped results)
  //   Older: summary only (tool list appended as text)
  const MAX_HISTORY = 40
  const FULL_DETAIL_WINDOW = 4
  const MEDIUM_DETAIL_WINDOW = 8

  const rawMessages = body.messages || []
  let trimmedMessages = rawMessages.length > MAX_HISTORY
    ? [...rawMessages.slice(0, 2), ...rawMessages.slice(-(MAX_HISTORY - 2))]
    : rawMessages

  trimmedMessages = trimmedMessages.map((m: any, i: number) => {
    const fromEnd = trimmedMessages.length - i

    // Tier 1: Last 4 messages — full detail
    if (fromEnd <= FULL_DETAIL_WINDOW) return m

    // Tier 2: Messages 5-8 — keep tool names + paths, strip content/results
    if (fromEnd <= MEDIUM_DETAIL_WINDOW && m.role === 'assistant' && m.toolInvocations?.length > 0) {
      return {
        ...m,
        toolInvocations: m.toolInvocations.map((inv: any) => ({
          ...inv,
          args: { path: inv.args?.path, template: inv.args?.template },
          result: inv.result?.ok !== undefined ? { ok: inv.result.ok } : undefined,
        })),
      }
    }

    // Tier 3: Older messages — summarize tool invocations as text
    if (m.role === 'assistant' && m.toolInvocations?.length > 0) {
      const summary = m.toolInvocations.map((inv: any) => {
        const name = inv.toolName
        const path = inv.args?.path || inv.args?.query || ''
        return path ? `${name}(${path})` : name
      }).join(', ')
      return {
        role: 'assistant',
        content: (m.content || '') + (summary ? `\n[Tools used: ${summary}]` : ''),
      }
    }
    return m
  })

  // Convert messages
  let messages
  try {
    messages = convertToCoreMessages(trimmedMessages)
  } catch {
    messages = trimmedMessages.map((m: { role: string; content?: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content || '',
    }))
  }

  // Save user message to database if projectId exists
  if (projectId && messages.length > 0) {
    const lastMessage = messages[messages.length - 1]
    if (lastMessage.role === 'user') {
      try {
        await supabaseFetch('/forge_chat_messages', {
          method: 'POST',
          body: JSON.stringify({
            project_id: projectId,
            role: 'user',
            content: lastMessage.content,
          }),
        })
      } catch (error) {
        console.error('Failed to save user message:', error)
      }
    }
  }

  const streamData = new StreamData()

  // Global timeout: abort the entire streamText operation after 5 minutes
  // Prevents indefinitely hanging requests if the model or tool execution stalls.
  const streamAbort = new AbortController()
  const streamTimeout = setTimeout(() => streamAbort.abort('Stream timeout: 5 minutes exceeded'), 5 * 60 * 1000)

  const result = streamText({
    // Prompt caching: system prompt + tool definitions cached by Anthropic.
    // 90% input token discount on cached prefix for subsequent requests in same session.
    model: anthropic(selectedModel, { cacheControl: true }),
    system: SYSTEM_PROMPT + `\n\n---\nProject: "${projectName}"${projectId ? ` (id: ${projectId})` : ''}\nFile manifest:\n${manifestStr}`,
    messages,
    maxSteps: 50,
    abortSignal: streamAbort.signal,
    tools: {

      // ─── Agentic Planning ──────────────────────────────────────

      think: tool({
        description: 'Think through your approach before building. Use this for complex tasks (3+ files) to plan the file structure, component hierarchy, and implementation order.',
        parameters: z.object({
          plan: z.string().describe('Your step-by-step plan for implementing this task'),
          files: z.array(z.string()).describe('List of files you plan to create/modify'),
          approach: z.string().optional().describe('Key architectural decisions'),
        }),
        execute: async ({ plan, files, approach }) => ({
          acknowledged: true,
          plan,
          files,
          approach,
        }),
      }),

      suggest_improvement: tool({
        description: 'Log a tooling limitation, bug, or improvement suggestion. Use when you encounter something that blocks or slows your work.',
        parameters: z.object({
          issue: z.string().describe('What limitation or bug you encountered'),
          suggestion: z.string().describe('Specific fix — include exact code changes if possible'),
          file: z.string().optional().describe('Which source file needs to change'),
          priority: z.enum(['low', 'medium', 'high']).describe('Impact level'),
        }),
        execute: async ({ issue, suggestion, file, priority }) => ({
          logged: true,
          issue,
          suggestion,
          file,
          priority,
        }),
      }),

      // ─── File Operations (lean results) ────────────────────────

      write_file: tool({
        description: 'Create or overwrite a file. Result is lean to save tokens.',
        parameters: z.object({
          path: z.string().describe('File path relative to project root'),
          content: z.string().describe('Complete file content'),
        }),
        execute: async ({ path, content }) => {
          const safePath = VirtualFS.sanitizePath(path)
          if (!safePath) return { error: `Invalid file path: ${path}` }
          vfs.write(safePath, content)
          const result: Record<string, unknown> = { ok: true, path: safePath, lines: content.split('\n').length }
          if (safePath.endsWith('.json')) {
            try { JSON.parse(content) } catch (e: any) {
              result.warning = `Invalid JSON: ${e.message}. The file was written but may cause build errors.`
            }
          }
          return result
        },
      }),

      read_file: tool({
        description: 'Read a file\'s content. Only use when you need existing content before editing. Supports pagination for large files via offset/limit.',
        parameters: z.object({
          path: z.string().describe('File path relative to project root'),
          offset: z.number().optional().describe('Line number to start from (1-based, default: 1)'),
          limit: z.number().optional().describe('Max lines to return (default/max: 2000)'),
        }),
        execute: async ({ path, offset, limit }) => {
          const content = vfs.read(path)
          if (content === undefined) return { error: `File not found: ${path}` }
          const allLines = content.split('\n')
          const totalLines = allLines.length
          const startLine = Math.max(1, offset || 1)
          const maxLines = Math.min(limit || 2000, 2000)
          const sliced = allLines.slice(startLine - 1, startLine - 1 + maxLines)
          const isTruncated = totalLines > startLine - 1 + maxLines
          return {
            content: sliced.join('\n'),
            path,
            lines: totalLines,
            ...(isTruncated ? { truncated: true, showing: `${startLine}-${startLine + sliced.length - 1} of ${totalLines}`, hint: 'Use offset/limit to read remaining lines.' } : {}),
          }
        },
      }),

      edit_file: tool({
        description: 'Edit a file by replacing a specific string. old_string must match EXACTLY (including whitespace/indentation). IMPORTANT: If you did NOT write this file yourself in this conversation, you MUST call read_file first. If this tool returns an error, STOP and call read_file before retrying — never guess.',
        parameters: z.object({
          path: z.string().describe('File path'),
          old_string: z.string().describe('Exact string to find (must match whitespace/indentation)'),
          new_string: z.string().describe('Replacement string'),
        }),
        execute: async ({ path, old_string, new_string }) => {
          const safePath = VirtualFS.sanitizePath(path)
          if (!safePath) return { error: `Invalid file path: ${path}` }
          const content = vfs.read(safePath)
          if (content === undefined) return { error: `File not found: ${path}` }

          // ── Pass 1: Exact match (fast path) ─────────────���────────
          if (content.includes(old_string)) {
            const occurrences = content.split(old_string).length - 1
            if (occurrences > 1) {
              return { error: `Found ${occurrences} occurrences. Provide more context to make it unique.` }
            }
            const updated = content.replace(old_string, new_string)
            vfs.write(safePath, updated)
            return { ok: true, path: safePath, lines: updated.split('\n').length }
          }

          // ── Helper: strip each line's indent and collapse runs ───
          const normLine = (s: string) => s.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim()
          const normLines = (s: string) => s.split('\n').map(l => l.trim()).filter(l => l.length > 0)

          const oldTrimmedLines = normLines(old_string)
          const fileTrimmedLines = content.split('\n').map(l => l.trim())
          const fileRawLines = content.split('\n')

          // ── Pass 2: Line-by-line indent-insensitive match ────────
          // Strips leading/trailing whitespace per line, skips blank lines in old_string,
          // and uses a sliding window with tolerance for ±2 extra/fewer lines
          let bestMatch: { start: number; end: number } | null = null

          for (let i = 0; i < fileRawLines.length; i++) {
            // Does this file line match the first non-empty old line?
            if (fileTrimmedLines[i] !== oldTrimmedLines[0]) continue

            // Walk forward through old lines, matching against file lines
            // Allow file to have extra blank lines between content lines
            let fi = i
            let oi = 0
            let matched = true

            while (oi < oldTrimmedLines.length && fi < fileRawLines.length) {
              // Skip blank lines in file
              if (fileTrimmedLines[fi] === '') {
                fi++
                continue
              }
              if (fileTrimmedLines[fi] === oldTrimmedLines[oi]) {
                oi++
                fi++
              } else {
                matched = false
                break
              }
            }

            if (matched && oi === oldTrimmedLines.length) {
              // fi is now one past the last matched line; trim trailing blanks
              while (fi > i && fileRawLines[fi - 1].trim() === '') fi--
              bestMatch = { start: i, end: fi }
              break
            }
          }

          if (bestMatch) {
            // Uniqueness check: scan for a second fuzzy match after the first
            let secondMatch = false
            for (let i = bestMatch.end; i < fileRawLines.length; i++) {
              if (fileTrimmedLines[i] !== oldTrimmedLines[0]) continue
              let fi2 = i, oi2 = 0, matched2 = true
              while (oi2 < oldTrimmedLines.length && fi2 < fileRawLines.length) {
                if (fileTrimmedLines[fi2] === '') { fi2++; continue }
                if (fileTrimmedLines[fi2] === oldTrimmedLines[oi2]) { oi2++; fi2++ }
                else { matched2 = false; break }
              }
              if (matched2 && oi2 === oldTrimmedLines.length) { secondMatch = true; break }
            }
            if (secondMatch) {
              return { error: 'Found multiple fuzzy matches for this code block. Provide more surrounding context to make old_string unique, or use exact whitespace.' }
            }

            const before = fileRawLines.slice(0, bestMatch.start).join('\n')
            const after = fileRawLines.slice(bestMatch.end).join('\n')
            const updated = [before, new_string, after].filter(s => s !== '').join('\n')
            vfs.write(safePath, updated)
            return { ok: true, path: safePath, lines: updated.split('\n').length, note: 'Matched with indent-insensitive fuzzy matching' }
          }

          // Passes 3 (single-line fuzzy) and 4 (subsequence) removed —
          // they were too risky (could silently match wrong code blocks).
          // Only exact match (pass 1) and indent-insensitive (pass 2) remain.

          // ── No match — return helpful context ────────────────────
          const firstOldLine = old_string.split('\n')[0].trim()
          const oldLines = old_string.split('\n')
          const nearLines: string[] = []
          for (let i = 0; i < fileRawLines.length; i++) {
            if (fileRawLines[i].includes(firstOldLine) || (firstOldLine.length > 10 && fileRawLines[i].trim().startsWith(firstOldLine.slice(0, 20)))) {
              const start = Math.max(0, i - 2)
              const end = Math.min(fileRawLines.length, i + oldLines.length + 2)
              nearLines.push(`Lines ${start + 1}-${end}:\n${fileRawLines.slice(start, end).join('\n')}`)
              break
            }
          }

          const fails = (editFailCounts.get(safePath) || 0) + 1
          editFailCounts.set(safePath, fails)
          return {
            error: 'old_string not found in file. You MUST call read_file on this file before retrying. Do NOT guess at the content.',
            hint: fails >= 3
              ? `You have failed to edit this file ${fails} times. Use write_file to rewrite it instead of continuing to retry edit_file.`
              : 'STOP. Call read_file to see the actual file content, then use the exact text from read_file as old_string.',
            nearMatch: nearLines.length > 0 ? nearLines[0] : undefined,
            fileLength: `${fileRawLines.length} lines`,
          }
        },
      }),

      delete_file: tool({
        description: 'Delete a file from the project.',
        parameters: z.object({
          path: z.string().describe('File path to delete'),
        }),
        execute: async ({ path }) => {
          const safePath = VirtualFS.sanitizePath(path)
          if (!safePath) return { error: `Invalid file path: ${path}` }
          if (!vfs.exists(safePath)) return { error: `File not found: ${safePath}` }
          vfs.delete(safePath)
          return { ok: true, path: safePath, deleted: true }
        },
      }),

      list_files: tool({
        description: 'List all files in the project with their sizes.',
        parameters: z.object({
          prefix: z.string().optional().describe('Filter files starting with this path prefix'),
        }),
        execute: async ({ prefix }) => {
          const files = vfs.list(prefix)
          return { files, count: files.length }
        },
      }),

      search_files: tool({
        description: 'Search file contents with a regex pattern.',
        parameters: z.object({
          pattern: z.string().describe('Regex pattern to search for'),
        }),
        execute: async ({ pattern }) => {
          const results = vfs.search(pattern)
          if (!Array.isArray(results)) return results
          return { results, count: results.length }
        },
      }),

      grep_files: tool({
        description: 'Search file contents with regex and return matches with surrounding context lines. Better than search_files when you need to see code around matches before editing.',
        parameters: z.object({
          pattern: z.string().describe('Regex pattern to search for'),
          context: z.number().optional().describe('Lines of context before and after each match (default: 3)'),
          maxResults: z.number().optional().describe('Max results to return (default: 10)'),
        }),
        execute: async ({ pattern, context: ctx, maxResults }) => {
          const contextLines = ctx ?? 3
          const max = maxResults ?? 10
          const results: Array<{ file: string; line: number; match: string; context: string }> = []
          let regex: RegExp
          try {
            regex = new RegExp(pattern, 'i')
          } catch {
            return { error: `Invalid regex pattern: ${pattern}` }
          }
          for (const [path, content] of vfs.files) {
            if (results.length >= max) break
            const lines = content.split('\n')
            for (let i = 0; i < lines.length && results.length < max; i++) {
              if (regex.test(lines[i])) {
                const start = Math.max(0, i - contextLines)
                const end = Math.min(lines.length, i + contextLines + 1)
                const contextBlock = lines.slice(start, end)
                  .map((l, idx) => `${start + idx + 1}${start + idx === i ? '>' : ' '} ${l}`)
                  .join('\n')
                results.push({ file: path, line: i + 1, match: lines[i].trim().slice(0, 200), context: contextBlock })
              }
            }
          }
          return { results, count: results.length }
        },
      }),

      // ─── Project Scaffolding ────────────────────────────────────

      create_project: tool({
        description: 'Scaffold a new project from a template. Always call this FIRST for new projects. Templates: nextjs (blank), vite-react, static, saas (landing page with hero/features/pricing), blog, dashboard (admin panel with sidebar/stats), ecommerce (product grid with cart), portfolio (developer portfolio), docs (documentation site with sidebar).',
        parameters: z.object({
          template: z.enum(['nextjs', 'vite-react', 'static', 'saas', 'blog', 'dashboard', 'ecommerce', 'portfolio', 'docs']).describe('Project template'),
          description: z.string().optional().describe('Project description'),
        }),
        execute: async ({ template, description }) => {
          const scaffold = TEMPLATES[template as TemplateName](projectName, description)
          for (const [path, content] of Object.entries(scaffold)) {
            vfs.write(path, content)
          }
          return {
            ok: true,
            template,
            files: Object.keys(scaffold),
          }
        },
      }),

      // ─── GitHub Operations ──────────────────────────────────────

      github_create_repo: tool({
        description: 'Create a new GitHub repository and push all project files to it. Returns a taskId — use check_task_status to poll for completion.',
        parameters: z.object({
          repoName: z.string().describe('Repository name'),
          isPublic: z.boolean().optional().describe('Make repo public (default: private)'),
          description: z.string().optional().describe('Repository description'),
        }),
        execute: async ({ repoName, isPublic, description }) => {
          if (!effectiveGithubToken) return { error: 'Not authenticated. Sign in with GitHub.' }

          const files = vfs.toRecord()
          if (Object.keys(files).length === 0) return { error: 'No files to push.' }
          const token = effectiveGithubToken

          const { taskId, error } = await TaskStore.createPersistent(
            supabaseFetch,
            projectId,
            'github_create',
            async (_onProgress) => {
              const repo = await githubFetch('/user/repos', token, {
                method: 'POST',
                body: JSON.stringify({
                  name: repoName,
                  description: description || `Built with Forge`,
                  private: !isPublic,
                  auto_init: true,
                }),
              })
              if (repo.error) {
                if (repo.status === 422) throw new Error(`Repository "${repoName}" already exists. Choose a different name.`)
                throw new Error(`Failed to create repo: ${repo.error}`)
              }

              const owner = repo.owner.login
              await new Promise(resolve => setTimeout(resolve, 2000))

              // Retry getting initial ref (GitHub can be slow)
              let ref: any
              for (let attempt = 0; attempt < 3; attempt++) {
                ref = await githubFetch(`/repos/${owner}/${repoName}/git/refs/heads/main`, token)
                if (!ref.error) break
                await new Promise(resolve => setTimeout(resolve, 1500))
              }
              if (ref.error) throw new Error(`Repo created but failed to get initial ref: ${ref.error}`)
              const parentSha = ref.object.sha

              // Upload blobs in parallel batches of 5
              const fileEntries = Object.entries(files)
              const blobs = await batchParallel(fileEntries, 5, async ([path, content]) => {
                const blob = await githubFetch(`/repos/${owner}/${repoName}/git/blobs`, token, {
                  method: 'POST',
                  body: JSON.stringify({ content, encoding: 'utf-8' }),
                })
                if (blob.error) throw new Error(`Failed to create blob for ${path}: ${blob.error}`)
                return { path, mode: '100644' as const, type: 'blob' as const, sha: blob.sha as string }
              })

              const tree = await githubFetch(`/repos/${owner}/${repoName}/git/trees`, token, {
                method: 'POST',
                body: JSON.stringify({ base_tree: parentSha, tree: blobs }),
              })
              if (tree.error) throw new Error(`Failed to create tree: ${tree.error}`)

              const commit = await githubFetch(`/repos/${owner}/${repoName}/git/commits`, token, {
                method: 'POST',
                body: JSON.stringify({ message: 'Initial commit from Forge', tree: tree.sha, parents: [parentSha] }),
              })
              if (commit.error) throw new Error(`Failed to create commit: ${commit.error}`)

              const updateRef = await githubFetch(`/repos/${owner}/${repoName}/git/refs/heads/main`, token, {
                method: 'PATCH',
                body: JSON.stringify({ sha: commit.sha }),
              })
              if (updateRef.error) throw new Error(`Failed to update branch ref: ${updateRef.error}`)

              return {
                ok: true,
                url: repo.html_url,
                owner,
                repoName,
                commitSha: commit.sha,
                filesCount: Object.keys(files).length,
              }
            },
          )
          if (error) return { error }
          return { taskId, status: 'running', message: `Creating repo and pushing ${Object.keys(files).length} files. Use check_task_status to monitor.` }
        },
      }),

      github_push_update: tool({
        description: 'Push updated files to an existing GitHub repository. Returns a taskId — use check_task_status to poll for completion.',
        parameters: z.object({
          owner: z.string().describe('GitHub username/org'),
          repo: z.string().describe('Repository name'),
          message: z.string().describe('Commit message'),
          branch: z.string().optional().describe('Branch name (default: main, falls back to master)'),
        }),
        execute: async ({ owner, repo, message, branch }) => {
          if (!effectiveGithubToken) return { error: 'Not authenticated. Sign in with GitHub.' }
          const branchName = branch || 'main'
          const files = vfs.toRecord()
          if (Object.keys(files).length === 0) return { error: 'No files to push.' }
          const token = effectiveGithubToken

          const { taskId, error } = await TaskStore.createPersistent(
            supabaseFetch,
            projectId,
            'github_push',
            async (_onProgress) => {
              // Try specified branch, fall back to main/master
              let ref = await githubFetch(`/repos/${owner}/${repo}/git/refs/heads/${branchName}`, token)
              if (ref.error && branchName === 'main') {
                ref = await githubFetch(`/repos/${owner}/${repo}/git/refs/heads/master`, token)
              }
              if (ref.error) throw new Error(`Failed to get branch "${branchName}": ${ref.error}`)
              const parentSha = ref.object.sha

              // Upload blobs in parallel batches of 5
              const fileEntries = Object.entries(files)
              const blobs = await batchParallel(fileEntries, 5, async ([path, content]) => {
                const blob = await githubFetch(`/repos/${owner}/${repo}/git/blobs`, token, {
                  method: 'POST',
                  body: JSON.stringify({ content, encoding: 'utf-8' }),
                })
                if (blob.error) throw new Error(`Failed to create blob for ${path}: ${blob.error}`)
                return { path, mode: '100644' as const, type: 'blob' as const, sha: blob.sha as string }
              })

              const tree = await githubFetch(`/repos/${owner}/${repo}/git/trees`, token, {
                method: 'POST',
                body: JSON.stringify({ base_tree: parentSha, tree: blobs }),
              })
              if (tree.error) throw new Error(`Failed to create tree: ${tree.error}`)

              const commit = await githubFetch(`/repos/${owner}/${repo}/git/commits`, token, {
                method: 'POST',
                body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] }),
              })
              if (commit.error) throw new Error(`Failed to commit: ${commit.error}`)

              const update = await githubFetch(`/repos/${owner}/${repo}/git/refs/heads/${branchName}`, token, {
                method: 'PATCH',
                body: JSON.stringify({ sha: commit.sha }),
              })
              if (update.error) throw new Error(`Failed to update ref: ${update.error}`)

              return {
                ok: true,
                commitSha: commit.sha,
                filesCount: Object.keys(files).length,
                repoUrl: `https://github.com/${owner}/${repo}`,
                commitUrl: `https://github.com/${owner}/${repo}/commit/${commit.sha}`,
              }
            },
          )
          if (error) return { error }
          return { taskId, status: 'running', message: `Pushing ${Object.keys(files).length} files to ${owner}/${repo}. Use check_task_status to monitor.` }
        },
      }),

      // ─── Vercel Deployment ──────────────────────────────────────

      deploy_to_vercel: tool({
        description: 'Deploy the current project files to Vercel. Returns a taskId — use check_task_status to poll for completion. Build errors are automatically captured.',
        parameters: z.object({
          framework: z.enum(['nextjs', 'vite', 'nuxtjs', 'astro', 'sveltekit', 'remix', 'static']).optional().describe('Framework hint (auto-detected if omitted)'),
        }),
        execute: async ({ framework }) => {
          const files = vfs.toRecord()
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

          const { taskId, error } = await TaskStore.createPersistent(
            supabaseFetch,
            projectId,
            'deploy',
            (onProgress) => vercelDeploy(projectName, files, fw, onProgress, Object.keys(clientEnvVars).length > 0 ? clientEnvVars : undefined),
          )
          if (error) return { error }
          const envNote = Object.keys(clientEnvVars).length > 0 ? ` with ${Object.keys(clientEnvVars).length} env vars` : ''
          return { taskId, status: 'running', message: `Deploying ${Object.keys(files).length} files${fw ? ` (${fw})` : ''}${envNote}. Use check_task_status to monitor progress.` }
        },
      }),

      // ─── Background Task Polling ────────────────────────────────

      check_task_status: tool({
        description: 'Check the status of a background task (deploy, GitHub push, build check). Use this to poll for completion after a tool returns a taskId.',
        parameters: z.object({
          taskId: z.string().describe('Task ID returned by deploy_to_vercel, github_create_repo, github_push_update, or forge_check_build'),
        }),
        execute: async ({ taskId }) => {
          // Check in-request store first
          const inReq = taskStore.check(taskId)
          if (inReq) return inReq

          // Check persistent Supabase store
          const persistent = await TaskStore.checkPersistent(supabaseFetch, taskId)
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
          const result = await TaskStore.cancelPersistent(supabaseFetch, taskId)
          if (!result.ok) return { error: result.error }
          return { ok: true, taskId }
        },
      }),

      // ─── Utility ���───────────────────────────────────────────────

      get_all_files: tool({
        description: 'Get the file manifest (path, lines, size). No content.',
        parameters: z.object({}),
        execute: async () => {
          return { manifest: vfs.manifest(), totalFiles: vfs.list().length }
        },
      }),

      rename_file: tool({
        description: 'Rename/move a file within the project.',
        parameters: z.object({
          oldPath: z.string().describe('Current file path'),
          newPath: z.string().describe('New file path'),
        }),
        execute: async ({ oldPath, newPath }) => {
          const safeOld = VirtualFS.sanitizePath(oldPath)
          const safeNew = VirtualFS.sanitizePath(newPath)
          if (!safeOld) return { error: `Invalid old path: ${oldPath}` }
          if (!safeNew) return { error: `Invalid new path: ${newPath}` }
          const content = vfs.read(safeOld)
          if (content === undefined) return { error: `File not found: ${safeOld}` }
          vfs.delete(safeOld)
          vfs.write(safeNew, content)
          return { ok: true, oldPath: safeOld, newPath: safeNew }
        },
      }),

      add_dependency: tool({
        description: 'Add an npm package to package.json. Validates the package exists on npm first. ALWAYS use this when importing a package not already in package.json.',
        parameters: z.object({
          name: z.string().describe('npm package name, e.g. "framer-motion"'),
          version: z.string().optional().describe('Version range (default: ^latest)'),
          dev: z.boolean().optional().describe('Add to devDependencies instead of dependencies'),
        }),
        execute: async ({ name, version, dev }) => {
          try {
            const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
              headers: { Accept: 'application/json' },
            })
            if (res.status === 404) return { error: `Package "${name}" does not exist on npm. Do NOT import it.` }
            if (!res.ok) return { error: `npm registry error: ${res.status}` }
            const data = await res.json()
            const latest = data['dist-tags']?.latest
            const ver = version || `^${latest}`

            const pkgPath = 'package.json'
            const pkgContent = vfs.read(pkgPath)
            if (!pkgContent) return { error: 'No package.json found. Create one first with create_project.' }

            const pkg = JSON.parse(pkgContent)
            const field = dev ? 'devDependencies' : 'dependencies'
            if (!pkg[field]) pkg[field] = {}
            if (pkg[field][name]) return { ok: true, path: pkgPath, note: `${name} already in ${field} (${pkg[field][name]})`, skipped: true }
            pkg[field][name] = ver
            vfs.write(pkgPath, JSON.stringify(pkg, null, 2))
            return { ok: true, path: pkgPath, added: name, version: ver, field }
          } catch (err) {
            return { error: err instanceof Error ? err.message : 'Failed to check npm' }
          }
        },
      }),

      // ═══════════════════════════════════════════════════════════════
      // SUPERPOWER TOOLS
      // ═══════════════════════════════════════════════════════════════

      // ─── Database Operations ────────────────────────────────────

      db_query: tool({
        description: 'Query the Supabase database. Restricted to forge_* tables and credit_packages (read-only). Tables: forge_projects, forge_project_files, forge_chat_messages, forge_deployments, forge_tasks, credit_packages.',
        parameters: z.object({
          table: z.string().describe('Table name, e.g. "forge_projects"'),
          select: z.string().optional().describe('Columns to select, e.g. "id, name, created_at" (default: *)'),
          filters: z.string().optional().describe('PostgREST filter query string, e.g. "status=eq.active&limit=10"'),
          order: z.string().optional().describe('Order clause, e.g. "created_at.desc"'),
          limit: z.number().optional().describe('Max rows to return (default: 50)'),
        }),
        execute: async ({ table, select, filters, order, limit }) => {
          // Security: restrict to forge_* tables + credit_packages read-only
          const ALLOWED_TABLES = /^(forge_|credit_packages$)/
          if (!ALLOWED_TABLES.test(table)) {
            return { error: `Access denied: db_query restricted to forge_* tables. "${table}" is not allowed.` }
          }

          const params = new URLSearchParams()
          if (select) params.set('select', select)
          if (order) params.set('order', order)
          params.set('limit', String(limit || 50))

          const filterStr = filters ? `&${filters}` : ''
          const result = await supabaseFetch(`/${table}?${params.toString()}${filterStr}`)

          if (!result.ok) return { error: `DB query failed: ${JSON.stringify(result.data)}` }
          return { data: result.data, count: Array.isArray(result.data) ? result.data.length : 1 }
        },
      }),

      db_mutate: tool({
        description: 'Insert, update, or delete data in forge_* tables in the Supabase database.',
        parameters: z.object({
          operation: z.enum(['insert', 'update', 'upsert', 'delete']).describe('Operation type'),
          table: z.string().describe('Table name (must start with forge_)'),
          data: z.any().optional().describe('Data to insert/update (object or array of objects)'),
          filters: z.string().optional().describe('PostgREST filter for update/delete, e.g. "id=eq.abc123"'),
          onConflict: z.string().optional().describe('For upsert: conflict column(s), e.g. "project_id,path"'),
        }),
        execute: async ({ operation, table, data, filters, onConflict }) => {
          // Security: restrict to forge_* tables only
          if (!table.startsWith('forge_')) {
            return { error: `Access denied: can only mutate forge_* tables, got "${table}"` }
          }

          let path = `/${table}`
          const filterStr = filters ? `?${filters}` : ''

          switch (operation) {
            case 'insert': {
              const result = await supabaseFetch(path, {
                method: 'POST',
                body: JSON.stringify(data),
              })
              return result.ok ? { ok: true, data: result.data } : { error: JSON.stringify(result.data) }
            }
            case 'upsert': {
              const headers: Record<string, string> = {}
              if (onConflict) headers['Prefer'] = `return=representation,resolution=merge-duplicates`
              const queryStr = onConflict ? `?on_conflict=${onConflict}` : ''
              const result = await supabaseFetch(`${path}${queryStr}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(data),
              })
              return result.ok ? { ok: true, data: result.data } : { error: JSON.stringify(result.data) }
            }
            case 'update': {
              const result = await supabaseFetch(`${path}${filterStr}`, {
                method: 'PATCH',
                body: JSON.stringify(data),
              })
              return result.ok ? { ok: true, data: result.data } : { error: JSON.stringify(result.data) }
            }
            case 'delete': {
              const result = await supabaseFetch(`${path}${filterStr}`, {
                method: 'DELETE',
              })
              return result.ok ? { ok: true } : { error: JSON.stringify(result.data) }
            }
          }
        },
      }),

      // ─── Project Persistence ────────────────────────────────────

      save_project: tool({
        description: 'Save the current project files to the database. Call this after significant changes to persist the user\'s work.',
        parameters: z.object({
          description: z.string().optional().describe('Updated project description'),
        }),
        execute: async ({ description }) => {
          if (!projectId) return { ok: false, note: 'No project ID — project will be saved client-side when user signs in' }

          const files = vfs.toRecord()
          const filePaths = Object.keys(files)

          // Update project metadata
          const updates: Record<string, unknown> = {}
          if (description) updates.description = description
          if (Object.keys(updates).length > 0) {
            await supabase.from('forge_projects').update(updates).eq('id', projectId)
          }

          // Delete removed files
          if (filePaths.length > 0) {
            await supabase
              .from('forge_project_files')
              .delete()
              .eq('project_id', projectId)
              .not('path', 'in', `(${filePaths.map(p => `"${p}"`).join(',')})`)
          }

          // Upsert current files
          if (filePaths.length > 0) {
            const rows = filePaths.map(path => ({
              project_id: projectId,
              path,
              content: files[path],
            }))
            await supabase
              .from('forge_project_files')
              .upsert(rows, { onConflict: 'project_id,path' })
          }

          return { ok: true, savedFiles: filePaths.length }
        },
      }),

      // ─── Self-Modification (SUPERPOWER) ─────────────────────────

      forge_read_own_source: tool({
        description: 'Read a file from Forge\'s own source code on GitHub (repo: Leigh12-93/forge). Use this to understand your own implementation before modifying it.',
        parameters: z.object({
          path: z.string().describe('File path in the Forge repo, e.g. "app/api/chat/route.ts" or "components/chat-panel.tsx"'),
          branch: z.string().optional().describe('Branch (default: master)'),
        }),
        execute: async ({ path, branch }) => {
          const token = GITHUB_TOKEN
          if (!token) return { error: 'No GitHub token configured' }

          const branchName = branch || 'master'
          const result = await githubFetch(
            `/repos/Leigh12-93/forge/contents/${path}?ref=${branchName}`,
            token
          )
          if (result.error) return { error: result.error }

          // GitHub returns base64-encoded content
          const content = Buffer.from(result.content, 'base64').toString('utf-8')
          return { path, content, size: content.length, lines: content.split('\n').length }
        },
      }),

      forge_modify_own_source: tool({
        description: 'Modify a file in Forge\'s own source code. This pushes a commit to the Forge repo on GitHub. Use with care — you are editing your own brain. ALWAYS use a feature branch, never master.',
        parameters: z.object({
          path: z.string().describe('File path to modify in Forge repo'),
          content: z.string().describe('New file content (complete file)'),
          message: z.string().describe('Commit message describing the change'),
          branch: z.string().describe('Branch name (must NOT be "master" or "main" — use a feature branch)'),
        }),
        execute: async ({ path, content, message, branch }) => {
          const token = GITHUB_TOKEN
          if (!token) return { error: 'No GitHub token configured' }

          const owner = 'Leigh12-93'
          const repo = 'forge'
          const branchName = branch || 'self-modify-' + Date.now()

          // Security: hard-reject pushes to protected branches
          const PROTECTED_BRANCHES = ['master', 'main', 'production']
          if (PROTECTED_BRANCHES.includes(branchName.toLowerCase())) {
            return { error: `Direct pushes to "${branchName}" are blocked. Use a feature branch (e.g. "feat/my-change"), then forge_create_pr to merge.` }
          }

          // Security: block direct pushes to master — must use a branch
          if (branchName === 'master' || branchName === 'main') {
            return { error: 'Direct pushes to master/main are blocked. Create a branch first with forge_create_branch, push to it, then create a PR with forge_create_pr.' }
          }

          // Get current file SHA (needed for update)
          const existing = await githubFetch(`/repos/${owner}/${repo}/contents/${path}?ref=${branchName}`, token)

          const body: Record<string, string> = {
            message: `[self-modify] ${message}`,
            content: Buffer.from(content).toString('base64'),
            branch: branchName,
          }
          if (existing.sha) body.sha = existing.sha

          const result = await githubFetch(`/repos/${owner}/${repo}/contents/${path}`, token, {
            method: 'PUT',
            body: JSON.stringify(body),
          })

          if (result.error) return { error: result.error }
          return {
            ok: true,
            path,
            commitSha: result.commit?.sha,
            note: 'File updated on GitHub. Use forge_redeploy to deploy the change.',
          }
        },
      }),

      forge_redeploy: tool({
        description: 'Trigger a redeployment of Forge itself on Vercel. Call this after using forge_modify_own_source to apply your changes.',
        parameters: z.object({
          reason: z.string().describe('Why are you redeploying? e.g. "Added new db_query tool"'),
        }),
        execute: async ({ reason }) => {
          // Trigger Vercel deploy hook or use the Vercel API to redeploy
          const token = VERCEL_TOKEN
          if (!token) return { error: 'No Vercel deploy token configured' }

          // Create a deployment from the latest Git commit
          const teamParam = VERCEL_TEAM ? `?teamId=${VERCEL_TEAM}` : ''
          const res = await fetch(`https://api.vercel.com/v13/deployments${teamParam}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: 'forge',
              gitSource: {
                type: 'github',
                org: 'Leigh12-93',
                repo: 'forge',
                ref: 'master',
              },
            }),
          })

          const data = await res.json()
          if (!res.ok) return { error: data.error?.message || `Vercel API ${res.status}` }
          return {
            ok: true,
            url: `https://${data.url}`,
            deploymentId: data.id,
            reason,
            note: 'Forge is redeploying. Changes will be live in ~60 seconds.',
          }
        },
      }),

      // ─── External Repo Access ───────────────────────────────────

      github_read_file: tool({
        description: 'Read a file from any GitHub repository you have access to. Use to inspect code in other projects like AussieSMS.',
        parameters: z.object({
          owner: z.string().describe('GitHub username/org, e.g. "Leigh12-93"'),
          repo: z.string().describe('Repository name'),
          path: z.string().describe('File path in the repo'),
          branch: z.string().optional().describe('Branch (default: main)'),
        }),
        execute: async ({ owner, repo, path, branch }) => {
          const token = effectiveGithubToken
          if (!token) return { error: 'Not authenticated' }

          const branchName = branch || 'main'
          const result = await githubFetch(
            `/repos/${owner}/${repo}/contents/${path}?ref=${branchName}`,
            token
          )
          if (result.error) return { error: result.error }

          if (result.type === 'dir') {
            // Return directory listing
            const entries = (result as any[]).map((e: any) => ({
              name: e.name,
              type: e.type,
              path: e.path,
              size: e.size,
            }))
            return { type: 'directory', entries, path }
          }

          const content = Buffer.from(result.content, 'base64').toString('utf-8')
          return { path, content, size: content.length, lines: content.split('\n').length }
        },
      }),

      github_list_repo_files: tool({
        description: 'List files in a GitHub repository directory. Use to explore codebases.',
        parameters: z.object({
          owner: z.string().describe('GitHub username/org'),
          repo: z.string().describe('Repository name'),
          path: z.string().optional().describe('Directory path (default: root)'),
          branch: z.string().optional().describe('Branch (default: main)'),
        }),
        execute: async ({ owner, repo, path, branch }) => {
          const token = effectiveGithubToken
          if (!token) return { error: 'Not authenticated' }

          const branchName = branch || 'main'
          const dirPath = path || ''
          const result = await githubFetch(
            `/repos/${owner}/${repo}/contents/${dirPath}?ref=${branchName}`,
            token
          )
          if (result.error) return { error: result.error }

          if (Array.isArray(result)) {
            const entries = result.map((e: any) => ({
              name: e.name,
              type: e.type,
              path: e.path,
              size: e.size,
            }))
            return { entries, count: entries.length }
          }
          return { error: 'Path is a file, not a directory. Use github_read_file instead.' }
        },
      }),

      github_modify_external_file: tool({
        description: 'Modify a file in any GitHub repository you have access to. Pushes a commit directly.',
        parameters: z.object({
          owner: z.string().describe('GitHub username/org'),
          repo: z.string().describe('Repository name'),
          path: z.string().describe('File path to modify'),
          content: z.string().describe('New file content'),
          message: z.string().describe('Commit message'),
          branch: z.string().optional().describe('Branch (default: main)'),
        }),
        execute: async ({ owner, repo, path, content, message, branch }) => {
          const token = effectiveGithubToken
          if (!token) return { error: 'Not authenticated' }

          const branchName = branch || 'main'

          // Get current file SHA
          const existing = await githubFetch(`/repos/${owner}/${repo}/contents/${path}?ref=${branchName}`, token)

          const body: Record<string, string> = {
            message,
            content: Buffer.from(content).toString('base64'),
            branch: branchName,
          }
          if (existing.sha) body.sha = existing.sha

          const result = await githubFetch(`/repos/${owner}/${repo}/contents/${path}`, token, {
            method: 'PUT',
            body: JSON.stringify(body),
          })

          if (result.error) return { error: result.error }
          return { ok: true, path, commitSha: result.commit?.sha }
        },
      }),

      // ─── Chat History ───────────────────────────────────────────

      load_chat_history: tool({
        description: 'Load previous chat messages for this project from the database.',
        parameters: z.object({}),
        execute: async () => {
          if (!projectId) return { error: 'No project ID available' }

          const result = await supabaseFetch(`/forge_chat_messages?project_id=eq.${projectId}&order=created_at.asc&limit=100`)
          if (!result.ok) return { error: `Failed to load chat history: ${JSON.stringify(result.data)}` }

          const messages = Array.isArray(result.data) ? result.data : []
          return {
            messages: messages.map((msg: any) => ({
              id: msg.id,
              role: msg.role,
              content: msg.content,
              tool_invocations: msg.tool_invocations,
              created_at: msg.created_at,
            })),
            count: messages.length
          }
        },
      }),

      // ─── Pull Latest from GitHub ──────────────────────────────

      github_pull_latest: tool({
        description: 'Pull the latest files from a GitHub repo into the current project. ALWAYS call this before github_push_update to avoid overwriting remote changes.',
        parameters: z.object({
          owner: z.string().describe('Repository owner'),
          repo: z.string().describe('Repository name'),
          branch: z.string().optional().describe('Branch to pull from (auto-detects default if omitted)'),
        }),
        execute: async ({ owner, repo, branch }) => {
          const token = effectiveGithubToken
          if (!token) return { error: 'No GitHub token available' }

          // Auto-detect default branch if not specified
          let targetBranch = branch
          if (!targetBranch) {
            try {
              const branchCtrl = new AbortController()
              const branchTimeout = setTimeout(() => branchCtrl.abort(), 30000)
              const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
                signal: branchCtrl.signal,
              })
              clearTimeout(branchTimeout)
              if (repoRes.ok) {
                const repoData = await repoRes.json()
                targetBranch = repoData.default_branch || 'main'
              } else {
                targetBranch = 'main'
              }
            } catch {
              targetBranch = 'main'
            }
          }

          // Get the tree recursively
          const treeCtrl = new AbortController()
          const treeTimeout = setTimeout(() => treeCtrl.abort(), 30000)
          const treeRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/git/trees/${targetBranch}?recursive=1`,
            { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' }, signal: treeCtrl.signal }
          )
          clearTimeout(treeTimeout)
          if (!treeRes.ok) return { error: `Failed to fetch tree: ${treeRes.status}` }
          const treeData = await treeRes.json()

          const textExts = new Set(['ts','tsx','js','jsx','json','css','scss','html','md','mdx','txt','yaml','yml','toml','sql','sh','py','rb','go','rs','java','kt','swift','c','cpp','h','xml','svg','graphql','gql','prisma'])
          const skipDirs = new Set(['node_modules','.git','.next','dist','build','.vercel','.turbo','coverage','__pycache__','.cache'])

          const blobs = (treeData.tree || []).filter((item: any) => {
            if (item.type !== 'blob' || item.size > 500000) return false
            const parts = item.path.split('/')
            if (parts.some((p: string) => skipDirs.has(p))) return false
            const ext = item.path.split('.').pop()?.toLowerCase() || ''
            const basename = item.path.split('/').pop() || ''
            if (['Dockerfile','Makefile','.gitignore','.env.example'].includes(basename)) return true
            return textExts.has(ext)
          }).slice(0, 300)

          // Fetch in batches of 10 to avoid GitHub rate limits
          const results: PromiseSettledResult<{ path: string; content: string } | null>[] = []
          for (let i = 0; i < blobs.length; i += 10) {
            const batch = blobs.slice(i, i + 10)
            const batchResults = await Promise.allSettled(
              batch.map(async (item: any) => {
                const res = await fetch(
                  `https://api.github.com/repos/${owner}/${repo}/git/blobs/${item.sha}`,
                  { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' }, signal: AbortSignal.timeout(15000) }
                )
                if (!res.ok) return null
                const data = await res.json()
                if (data.encoding === 'base64' && data.content) {
                  return { path: item.path, content: Buffer.from(data.content, 'base64').toString('utf-8') }
                }
                return null
              })
            )
            results.push(...batchResults)
            if (i + 10 < blobs.length) await new Promise(r => setTimeout(r, 100))
          }

          const pulledFiles: Record<string, string> = {}
          for (const r of results) {
            if (r.status === 'fulfilled' && r.value) {
              pulledFiles[r.value.path] = r.value.content
              vfs.write(r.value.path, r.value.content)
            }
          }

          return { ok: true, fileCount: Object.keys(pulledFiles).length, files: Object.keys(pulledFiles) }
        },
      }),

      // ─── GitHub Search ──────────────────────────────────────────

      github_search_code: tool({
        description: 'Search for code across GitHub repositories. Find files, functions, patterns.',
        parameters: z.object({
          query: z.string().describe('Search query. Supports GitHub code search syntax.'),
          repo: z.string().optional().describe('Restrict to a specific repo, e.g. "Leigh12-93/forge"'),
        }),
        execute: async ({ query, repo }) => {
          const token = effectiveGithubToken
          if (!token) return { error: 'Not authenticated' }

          const q = repo ? `${query} repo:${repo}` : query
          const result = await githubFetch(
            `/search/code?q=${encodeURIComponent(q)}&per_page=10`,
            token
          )
          if (result.error) return { error: result.error }

          const items = (result.items || []).map((item: any) => ({
            name: item.name,
            path: item.path,
            repo: item.repository?.full_name,
            url: item.html_url,
          }))
          return { results: items, total: result.total_count }
        },
      }),

      // ─── MCP Tools ───────────────────────────────────────────────

      mcp_list_servers: tool({
        description: 'List all configured MCP servers and their connection status, plus available tools.',
        parameters: z.object({}),
        execute: async () => {
          const servers = mcpClient.getServers()
          return {
            servers: servers.map(s => ({
              id: s.config.id,
              name: s.config.name,
              connected: s.connected,
              toolCount: s.tools.length,
              tools: s.tools.map(t => t.name),
              error: s.error,
            })),
          }
        },
      }),

      mcp_connect_server: tool({
        description: 'Add and connect to an MCP server. Discovers available tools automatically.',
        parameters: z.object({
          url: z.string().describe('MCP server HTTP endpoint URL'),
          name: z.string().describe('Display name for this server'),
          token: z.string().optional().describe('Bearer auth token (if required)'),
        }),
        execute: async ({ url, name, token }) => {
          const config = {
            id: `mcp-${Date.now()}`,
            name,
            description: '',
            url,
            enabled: true,
            tags: [] as string[],
            ...(token ? { auth: { type: 'bearer' as const, token } } : {}),
          }
          mcpClient.addServer(config)
          const state = await mcpClient.connect(config.id)
          return {
            ok: state.connected,
            serverId: config.id,
            tools: state.tools.map(t => ({ name: t.name, description: t.description })),
            error: state.error,
          }
        },
      }),

      mcp_call_tool: tool({
        description: 'Execute a tool on a connected MCP server. Use mcp_list_servers first to see available tools.',
        parameters: z.object({
          serverId: z.string().describe('ID of the connected MCP server'),
          tool: z.string().describe('Name of the tool to call'),
          args: z.record(z.unknown()).default({}).describe('Arguments to pass to the tool'),
        }),
        execute: async ({ serverId, tool: toolName, args }) => {
          try {
            const result = await mcpClient.callTool(serverId, toolName, args)
            return { ok: true, result }
          } catch (err) {
            return { error: err instanceof Error ? err.message : 'Tool call failed' }
          }
        },
      }),

      // ─── Self-Build Safety Tools ─────────────────────────────────

      forge_check_npm_package: tool({
        description: 'Check if an npm package exists and get its latest version. ALWAYS call this before adding a new dependency to package.json.',
        parameters: z.object({
          name: z.string().describe('npm package name, e.g. "@modelcontextprotocol/sdk"'),
        }),
        execute: async ({ name }) => {
          try {
            const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
              headers: { Accept: 'application/json' },
            })
            if (res.status === 404) return { exists: false, name, error: `Package "${name}" does NOT exist on npm. Do not add it to package.json.` }
            if (!res.ok) return { error: `npm registry returned ${res.status}` }
            const data = await res.json()
            const latest = data['dist-tags']?.latest
            const description = data.description || ''
            const deps = Object.keys(data.versions?.[latest]?.dependencies || {}).length
            return { exists: true, name, latest, description, dependencyCount: deps }
          } catch (err) {
            return { error: err instanceof Error ? err.message : 'Failed to check npm' }
          }
        },
      }),

      forge_revert_commit: tool({
        description: 'Revert the last commit on the Forge repo. Use this when a self-modification breaks the build.',
        parameters: z.object({
          reason: z.string().describe('Why are you reverting?'),
        }),
        execute: async ({ reason }) => {
          const token = GITHUB_TOKEN
          if (!token) return { error: 'No GitHub token configured' }

          const owner = 'Leigh12-93'
          const repo = 'forge'

          // Get the latest 2 commits to find parent
          const commits = await githubFetch(`/repos/${owner}/${repo}/commits?sha=master&per_page=2`, token)
          if (!Array.isArray(commits) || commits.length < 2) return { error: 'Cannot revert — need at least 2 commits' }

          const headSha = commits[0].sha
          const parentSha = commits[1].sha
          const headMessage = commits[0].commit.message

          // Get the parent tree
          const parentCommit = await githubFetch(`/repos/${owner}/${repo}/git/commits/${parentSha}`, token)
          if (parentCommit.error) return { error: `Failed to get parent commit: ${parentCommit.error}` }

          // Create a new commit that points to the parent's tree (effectively reverting)
          const newCommit = await githubFetch(`/repos/${owner}/${repo}/git/commits`, token, {
            method: 'POST',
            body: JSON.stringify({
              message: `[self-revert] Revert "${headMessage}"\n\nReason: ${reason}`,
              tree: parentCommit.tree.sha,
              parents: [headSha],
            }),
          })
          if (newCommit.error) return { error: `Failed to create revert commit: ${newCommit.error}` }

          // Update master to point to the revert commit
          const update = await githubFetch(`/repos/${owner}/${repo}/git/refs/heads/master`, token, {
            method: 'PATCH',
            body: JSON.stringify({ sha: newCommit.sha }),
          })
          if (update.error) return { error: `Failed to update master: ${update.error}` }

          return {
            ok: true,
            revertedCommit: headSha.slice(0, 7),
            revertedMessage: headMessage,
            newCommit: newCommit.sha.slice(0, 7),
            reason,
            note: 'Reverted successfully. Use forge_redeploy to deploy the revert.',
          }
        },
      }),

      forge_create_branch: tool({
        description: 'Create a new branch on the Forge repo for safe development. Use this instead of pushing directly to master.',
        parameters: z.object({
          branch: z.string().describe('Branch name, e.g. "feat/add-testing-tools"'),
          fromBranch: z.string().default('master').describe('Base branch to create from'),
        }),
        execute: async ({ branch, fromBranch }) => {
          const token = GITHUB_TOKEN
          if (!token) return { error: 'No GitHub token configured' }

          const owner = 'Leigh12-93'
          const repo = 'forge'

          // Get SHA of the base branch
          const ref = await githubFetch(`/repos/${owner}/${repo}/git/ref/heads/${fromBranch}`, token)
          if (ref.error) return { error: `Failed to read ${fromBranch}: ${ref.error}` }

          // Create new branch
          const result = await githubFetch(`/repos/${owner}/${repo}/git/refs`, token, {
            method: 'POST',
            body: JSON.stringify({
              ref: `refs/heads/${branch}`,
              sha: ref.object.sha,
            }),
          })
          if (result.error) return { error: `Failed to create branch: ${result.error}` }

          return {
            ok: true,
            branch,
            basedOn: fromBranch,
            sha: ref.object.sha.slice(0, 7),
            note: `Branch "${branch}" created. Use forge_modify_own_source with branch="${branch}" to push changes there instead of master.`,
          }
        },
      }),

      forge_create_pr: tool({
        description: 'Create a pull request on the Forge repo. Use after pushing changes to a feature branch.',
        parameters: z.object({
          title: z.string().describe('PR title'),
          body: z.string().describe('PR description'),
          head: z.string().describe('Source branch with changes'),
          base: z.string().default('master').describe('Target branch'),
        }),
        execute: async ({ title, body, head, base }) => {
          const token = GITHUB_TOKEN
          if (!token) return { error: 'No GitHub token configured' }

          const result = await githubFetch('/repos/Leigh12-93/forge/pulls', token, {
            method: 'POST',
            body: JSON.stringify({ title, body, head, base }),
          })
          if (result.error) return { error: `Failed to create PR: ${result.error}` }

          return {
            ok: true,
            number: result.number,
            url: result.html_url,
            title,
            head,
            base,
          }
        },
      }),

      forge_merge_pr: tool({
        description: 'Merge a pull request on the Forge repo. Only merge after verifying the preview deploy succeeded.',
        parameters: z.object({
          prNumber: z.number().describe('PR number to merge'),
          method: z.enum(['merge', 'squash', 'rebase']).default('squash').describe('Merge method'),
        }),
        execute: async ({ prNumber, method }) => {
          const token = GITHUB_TOKEN
          if (!token) return { error: 'No GitHub token configured' }

          const result = await githubFetch(`/repos/Leigh12-93/forge/pulls/${prNumber}/merge`, token, {
            method: 'PUT',
            body: JSON.stringify({ merge_method: method }),
          })
          if (result.error) return { error: `Failed to merge PR: ${result.error}` }

          return {
            ok: true,
            merged: true,
            sha: result.sha?.slice(0, 7),
            note: 'PR merged to master. Vercel will auto-deploy. Use forge_deployment_status to monitor.',
          }
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
          })
          if (!res.ok) {
            // Try alternative: list by name
            const res2 = await fetch(`https://api.vercel.com/v6/deployments${teamParam ? teamParam + '&' : '?'}limit=3`, {
              headers: { Authorization: `Bearer ${token}` },
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

      forge_list_branches: tool({
        description: 'List all branches on the Forge repo. Useful to see what feature branches exist.',
        parameters: z.object({}),
        execute: async () => {
          const token = GITHUB_TOKEN
          if (!token) return { error: 'No GitHub token configured' }
          const result = await githubFetch('/repos/Leigh12-93/forge/branches?per_page=30', token)
          if (!Array.isArray(result)) return { error: result.error || 'Failed to list branches' }
          return {
            branches: result.map((b: any) => ({
              name: b.name,
              sha: b.commit.sha.slice(0, 7),
              protected: b.protected,
            })),
          }
        },
      }),

      forge_delete_branch: tool({
        description: 'Delete a branch on the Forge repo after it has been merged.',
        parameters: z.object({
          branch: z.string().describe('Branch name to delete (cannot be master)'),
        }),
        execute: async ({ branch }) => {
          if (branch === 'master' || branch === 'main') return { error: 'Cannot delete master/main branch' }
          const token = GITHUB_TOKEN
          if (!token) return { error: 'No GitHub token configured' }
          const result = await githubFetch(`/repos/Leigh12-93/forge/git/refs/heads/${branch}`, token, {
            method: 'DELETE',
          })
          if (result.error) return { error: `Failed to delete branch: ${result.error}` }
          return { ok: true, deleted: branch }
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

      db_introspect: tool({
        description: 'Discover the schema of a Supabase table — columns, types, constraints. Restricted to forge_* and credit_packages tables.',
        parameters: z.object({
          table: z.string().describe('Table name to inspect, e.g. "forge_projects"'),
        }),
        execute: async ({ table }) => {
          // Validate table name (alphanumeric + underscores only)
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
            return { error: 'Invalid table name. Use only letters, numbers, and underscores.' }
          }
          // Security: restrict to forge_* tables + credit_packages
          const ALLOWED_TABLES = /^(forge_|credit_packages$)/
          if (!ALLOWED_TABLES.test(table)) {
            return { error: `Access denied: db_introspect restricted to forge_* tables. "${table}" is not allowed.` }
          }

          // Step 1: Check table exists and get row count
          const countRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?limit=0`, {
            method: 'GET',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Accept': 'application/json',
              'Prefer': 'count=exact',
            },
          })

          if (!countRes.ok) return { error: `Table "${table}" not found or not accessible (${countRes.status})` }

          const contentRange = countRes.headers.get('content-range')
          const totalRows = contentRange ? contentRange.split('/')[1] : 'unknown'

          // Step 2: Read 1 sample row and infer column names + types
          const sampleRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?limit=1`, {
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Accept': 'application/json',
            },
          })

          if (sampleRes.ok) {
            const sample = await sampleRes.json()
            if (Array.isArray(sample) && sample.length > 0) {
              const columns = Object.entries(sample[0]).map(([name, value]) => ({
                column_name: name,
                inferred_type: value === null ? 'unknown' : Array.isArray(value) ? 'array' : typeof value,
                sample_value: typeof value === 'string' ? value.slice(0, 50) : value,
              }))
              return { table, totalRows, columns }
            }
          }

          return { table, totalRows, columns: [], note: 'Table exists but is empty — no columns could be inferred' }
        },
      }),

      scaffold_component: tool({
        description: 'Generate a reusable UI component in shadcn/ui style. Creates the component file with proper TypeScript types, variants, and Tailwind styling.',
        parameters: z.object({
          name: z.string().describe('Component name in PascalCase, e.g. "Button", "Card", "Dialog"'),
          type: z.enum(['button', 'card', 'input', 'modal', 'badge', 'alert', 'tabs', 'dropdown', 'avatar', 'tooltip', 'custom']).describe('Component type'),
          variants: z.array(z.string()).optional().describe('Style variants, e.g. ["default", "destructive", "outline", "ghost"]'),
          description: z.string().optional().describe('What the component should do'),
        }),
        execute: async ({ name, type, variants, description }) => {
          const variantList = variants || ['default']
          const kebab = name.replace(/([A-Z])/g, (m, c, i) => (i > 0 ? '-' : '') + c.toLowerCase())
          const path = `components/ui/${kebab}.tsx`

          const variantStyles = variantList.map(v => {
            switch (v) {
              case 'default': return `      default: 'bg-forge-accent text-white hover:bg-forge-accent-hover'`
              case 'destructive': return `      destructive: 'bg-forge-danger text-white hover:bg-red-700'`
              case 'outline': return `      outline: 'border border-forge-border bg-transparent hover:bg-forge-surface'`
              case 'ghost': return `      ghost: 'hover:bg-forge-surface hover:text-forge-text'`
              case 'secondary': return `      secondary: 'bg-forge-surface text-forge-text hover:bg-forge-panel'`
              default: return `      '${v}': ''  // TODO: add styles`
            }
          }).join(',\n')

          const sizeStyles = `      default: 'h-10 px-4 py-2',
      sm: 'h-9 rounded-md px-3',
      lg: 'h-11 rounded-md px-8',
      icon: 'h-10 w-10'`

          let content: string
          if (type === 'card') {
            content = `import { cn } from '@/lib/utils'

interface ${name}Props extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function ${name}({ className, children, ...props }: ${name}Props) {
  return (
    <div className={cn('rounded-xl border border-forge-border bg-forge-panel p-6', className)} {...props}>
      {children}
    </div>
  )
}

export function ${name}Header({ className, children, ...props }: ${name}Props) {
  return <div className={cn('flex flex-col space-y-1.5 pb-4', className)} {...props}>{children}</div>
}

export function ${name}Title({ className, children, ...props }: ${name}Props) {
  return <h3 className={cn('text-lg font-semibold leading-none', className)} {...props}>{children}</h3>
}

export function ${name}Content({ className, children, ...props }: ${name}Props) {
  return <div className={cn('text-sm text-forge-text-dim', className)} {...props}>{children}</div>
}

export function ${name}Footer({ className, children, ...props }: ${name}Props) {
  return <div className={cn('flex items-center pt-4', className)} {...props}>{children}</div>
}
`
          } else if (type === 'input') {
            content = `import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface ${name}Props extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const ${name} = forwardRef<HTMLInputElement, ${name}Props>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && <label className="text-sm font-medium text-forge-text">{label}</label>}
        <input
          ref={ref}
          className={cn(
            'flex h-10 w-full rounded-lg border bg-forge-surface px-3 py-2 text-sm',
            'placeholder:text-forge-text-dim/50 outline-none transition-colors',
            error ? 'border-forge-danger' : 'border-forge-border focus:border-forge-accent',
            className,
          )}
          {...props}
        />
        {error && <p className="text-xs text-forge-danger">{error}</p>}
      </div>
    )
  }
)
${name}.displayName = '${name}'
`
          } else if (type === 'modal') {
            content = `'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ${name}Props {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
}

export function ${name}({ open, onClose, title, children, className }: ${name}Props) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [open, onClose])

  if (!open) return null

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => { if (e.target === overlayRef.current) onClose() }}>
      <div className="fixed inset-0 bg-black/50" />
      <div className={cn('relative z-50 w-full max-w-lg rounded-xl border border-forge-border bg-forge-bg p-6 shadow-xl animate-fade-in', className)}>
        <div className="flex items-center justify-between mb-4">
          {title && <h2 className="text-lg font-semibold text-forge-text">{title}</h2>}
          <button onClick={onClose} className="p-1 rounded-lg text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
`
          } else if (type === 'badge') {
            content = `import { cn } from '@/lib/utils'

const variants = {
${variantStyles}
} as const

interface ${name}Props extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof variants
  children: React.ReactNode
}

export function ${name}({ variant = 'default', className, children, ...props }: ${name}Props) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors', variants[variant], className)} {...props}>
      {children}
    </span>
  )
}
`
          } else if (type === 'alert') {
            content = `import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const variants = {
  info: { icon: Info, className: 'bg-blue-50 text-blue-800 border-blue-200' },
  success: { icon: CheckCircle, className: 'bg-green-50 text-green-800 border-green-200' },
  warning: { icon: AlertTriangle, className: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
  error: { icon: XCircle, className: 'bg-red-50 text-red-800 border-red-200' },
}

interface ${name}Props {
  variant?: keyof typeof variants
  title?: string
  children: React.ReactNode
  className?: string
}

export function ${name}({ variant = 'info', title, children, className }: ${name}Props) {
  const { icon: Icon, className: variantClass } = variants[variant]
  return (
    <div className={cn('flex gap-3 rounded-lg border p-4', variantClass, className)}>
      <Icon className="w-5 h-5 shrink-0 mt-0.5" />
      <div>
        {title && <p className="font-medium mb-1">{title}</p>}
        <div className="text-sm">{children}</div>
      </div>
    </div>
  )
}
`
          } else {
            // Default: button-style component with variants
            content = `import { cn } from '@/lib/utils'

const variants = {
${variantStyles}
} as const

const sizes = {
${sizeStyles}
} as const

interface ${name}Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
}

export function ${name}({ variant = 'default', size = 'default', className, children, ...props }: ${name}Props) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forge-accent/50',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
`
          }

          vfs.write(path, content)
          return {
            ok: true,
            path,
            component: name,
            type,
            variants: variantList,
            lines: content.split('\n').length,
          }
        },
      }),

      generate_env_file: tool({
        description: 'Analyze project files and generate a .env.example file listing all required environment variables.',
        parameters: z.object({}),
        execute: async () => {
          const envVars = new Map<string, string>()

          for (const [path, content] of vfs.files) {
            // Match process.env.VARIABLE_NAME
            const matches = content.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)
            for (const match of matches) {
              const varName = match[1]
              if (!envVars.has(varName)) {
                envVars.set(varName, path)
              }
            }
            // Match NEXT_PUBLIC_ in import.meta.env
            const metaMatches = content.matchAll(/import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g)
            for (const match of metaMatches) {
              if (!envVars.has(match[1])) envVars.set(match[1], path)
            }
          }

          if (envVars.size === 0) return { ok: true, path: '.env.example', note: 'No environment variables found in project files' }

          const lines = ['# Environment Variables', '# Generated from project source code', '']
          const sorted = Array.from(envVars.entries()).sort((a, b) => a[0].localeCompare(b[0]))

          for (const [name, source] of sorted) {
            lines.push(`# Used in: ${source}`)
            if (name.startsWith('NEXT_PUBLIC_')) {
              lines.push(`${name}=  # Public (exposed to browser)`)
            } else {
              lines.push(`${name}=  # Server-side only`)
            }
            lines.push('')
          }

          const content = lines.join('\n')
          vfs.write('.env.example', content)
          return { ok: true, path: '.env.example', variables: sorted.map(([name]) => name), count: envVars.size }
        },
      }),

      // ─── Environment Variables Input ────────────────────────────

      request_env_vars: tool({
        description: 'Request environment variables from the user. Use this BEFORE deploying when the project needs API keys, secrets, or config values. The user will see inline input fields in the chat to enter their credentials. Call this whenever you detect process.env references that need real values.',
        parameters: z.object({
          variables: z.array(z.object({
            name: z.string().describe('Env var name, e.g. DATABASE_URL'),
            description: z.string().optional().describe('What this variable is for'),
            required: z.boolean().optional().describe('Whether this is required (default true)'),
          })).describe('List of environment variables needed'),
        }),
        execute: async ({ variables }) => {
          // Also scan VFS for any process.env references the AI may have missed
          const detected = new Set(variables.map(v => v.name))
          for (const [, content] of vfs.files) {
            const matches = content.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)
            for (const match of matches) {
              if (!detected.has(match[1]) && !match[1].startsWith('NODE_') && match[1] !== 'NODE_ENV') {
                detected.add(match[1])
                variables.push({ name: match[1], description: `Detected in project source`, required: true })
              }
            }
          }
          return { variables, count: variables.length }
        },
      }),

      // ─── Sandbox Preview ───────────────���───────────────��────────

      start_sandbox: tool({
        description: 'Start a live preview sandbox for the current project. Uploads files to v0 Platform API and returns a live preview URL. Free — no tokens consumed. Use when the user wants to see their app running live.',
        parameters: z.object({}),
        execute: async () => {
          if (!projectId) return { error: 'No project ID — save the project first.' }
          const files = vfs.toRecord()
          if (Object.keys(files).length === 0) return { error: 'No files to preview.' }
          const result = await createV0Sandbox(projectId, files)
          return result
        },
      }),

      stop_sandbox: tool({
        description: 'Stop the running preview sandbox for the current project.',
        parameters: z.object({}),
        execute: async () => {
          if (!projectId) return { error: 'No project ID.' }
          return destroyV0Sandbox(projectId)
        },
      }),

      sandbox_status: tool({
        description: 'Check the status of the preview sandbox for the current project.',
        parameters: z.object({}),
        execute: async () => {
          if (!projectId) return { error: 'No project ID.' }
          const status = getV0SandboxStatus(projectId)
          if (!status) return { active: false, note: 'No sandbox running. Use start_sandbox to create one.' }
          return { active: true, ...status }
        },
      }),

      add_image: tool({
        description: 'Find a free image from Unsplash for the project. Returns a working image URL you can use in img tags or CSS backgrounds. If UNSPLASH_ACCESS_KEY is not set, returns placeholder guidance instead.',
        parameters: z.object({
          query: z.string().describe('Search query (e.g. "mountain landscape", "coffee shop", "team meeting")'),
          orientation: z.enum(['landscape', 'portrait', 'squarish']).default('landscape').describe('Image orientation'),
          size: z.enum(['raw', 'full', 'regular', 'small', 'thumb']).default('regular').describe('Image size variant'),
        }),
        execute: async ({ query, orientation, size }) => {
          const accessKey = clientEnvVars.UNSPLASH_ACCESS_KEY || process.env.UNSPLASH_ACCESS_KEY
          if (!accessKey) {
            // Fallback: use placeholder.co which always works without API keys
            const sizeMap: Record<string, string> = {
              raw: '1600x900', full: '1200x800', regular: '800x600', small: '400x300', thumb: '150x150',
            }
            const dims = sizeMap[size] || '800x600'
            const placeholderUrl = `https://placehold.co/${dims}/1a1a2e/eaeaea?text=${encodeURIComponent(query.slice(0, 20))}`
            return {
              ok: true,
              url: placeholderUrl,
              suggestion: `Use: <img src="${placeholderUrl}" alt="${query}" />`,
              tip: 'This is a placeholder. Set UNSPLASH_ACCESS_KEY env var (free at unsplash.com/developers) for real photos.',
            }
          }

          try {
            const params = new URLSearchParams({ query, orientation, per_page: '1' })
            const res = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
              headers: { Authorization: `Client-ID ${accessKey}` },
              signal: AbortSignal.timeout(10000),
            })
            if (!res.ok) return { error: `Unsplash API error: ${res.status}` }
            const data = await res.json()
            if (!data.results?.length) return { error: `No images found for "${query}". Try a broader search term.` }

            const photo = data.results[0]
            const imageUrl = photo.urls?.[size] || photo.urls?.regular
            return {
              ok: true,
              url: imageUrl,
              downloadUrl: photo.links?.download_location,
              author: photo.user?.name,
              authorUrl: photo.user?.links?.html,
              suggestion: `Use: <img src="${imageUrl}" alt="${query}" />`,
              attribution: `Photo by ${photo.user?.name} on Unsplash`,
            }
          } catch (err) {
            return { error: err instanceof Error ? err.message : 'Failed to search Unsplash' }
          }
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

          const { taskId, error } = await TaskStore.createPersistent(
            supabaseFetch,
            projectId,
            'check_build',
            async (_onProgress) => {
              const teamParam = VERCEL_TEAM ? `?teamId=${VERCEL_TEAM}` : ''
              const res = await fetch(`https://api.vercel.com/v13/deployments${teamParam}`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
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
                  })
                  if (check.ok) {
                    const checkData = await check.json()
                    state = checkData.readyState || state
                    if (state === 'ERROR' || state === 'CANCELED') {
                      let errorLog = ''
                      try {
                        const logsRes = await fetch(`https://api.vercel.com/v2/deployments/${deployId}/events${teamParam}`, {
                          headers: { Authorization: `Bearer ${token}` },
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
          if (error) return { error }
          return { taskId, status: 'running', message: 'Preview build started. Use check_task_status to monitor progress (may take 60-90 seconds).' }
        },
      }),
    },

    onFinish: async (event) => {
      clearTimeout(streamTimeout)
      console.log(`[forge] ${event.usage?.totalTokens || 0} tokens, ${event.steps?.length || 0} steps`)

      // Stream real token usage to client
      if (event.usage) {
        streamData.append({
          type: 'usage',
          promptTokens: event.usage.promptTokens,
          completionTokens: event.usage.completionTokens,
          totalTokens: event.usage.totalTokens,
        })
      }
      await streamData.close()

      // Save assistant message to database if projectId exists
      if (projectId && event.text) {
        try {
          await supabaseFetch('/forge_chat_messages', {
            method: 'POST',
            body: JSON.stringify({
              project_id: projectId,
              role: 'assistant',
              content: event.text,
              tool_invocations: event.toolCalls || null,
            }),
          })
        } catch (error) {
          console.error('Failed to save assistant message:', error)
        }
      }
    },
  })

  return result.toDataStreamResponse({ data: streamData })
}
