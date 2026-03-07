import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  UIMessage,
} from 'ai'
import { anthropic, createAnthropic } from '@ai-sdk/anthropic'
import { chatLimiter } from '@/lib/rate-limit'
import { TaskStore } from '@/lib/background-tasks'
import { getSession, decryptToken } from '@/lib/auth'
import { supabaseFetch as supabaseFetchDirect } from '@/lib/supabase-fetch'
import { MEMORY_MARKER, buildSystemPrompt } from '@/lib/system-prompt'
import { VirtualFS } from '@/lib/virtual-fs'
import { compactMessages } from '@/lib/compaction'
import { GITHUB_TOKEN, githubFetch } from '@/lib/github'
import { supabaseFetch } from '@/lib/supabase-fetch'
import {
  createFileTools,
  createProjectTools,
  createGithubTools,
  createDeployTools,
  createSelfModTools,
  createDbTools,
  createUtilityTools,
  createTerminalTools,
  createTestingTools,
  createAuditTools,
  createTaskTools,
  createGoogleTools,
} from '@/lib/tools'
import type { ToolContext } from '@/lib/tools'

// ═══════════════════════════════════════════════════════════════════
// Module-level edit fail tracking — persists across requests per project
// Auto-expires entries after 10 minutes to prevent unbounded growth
// ═══════════════════════════════════════════════════════════════════
const activeStreams = new Map<string, { count: number; ts: number }>()
const MAX_CONCURRENT_STREAMS = 3
const STREAM_ENTRY_TTL = 5 * 60 * 1000 // 5 min TTL for stale entries

const usageTracker = new Map<string, { tokens: number; requests: number; ts: number }>()
const MAX_USAGE_ENTRIES = 500

const editFailCache = new Map<string, { counts: Map<string, number>; ts: number }>()

// Project memory cache — avoids DB round-trip on every message
const memoryCache = new Map<string, { data: Record<string, string>; ts: number }>()
const MEMORY_TTL = 60_000 // 1 minute

// six-chi.md content cache — hash-based, avoids full injection on every message
const sixChiCache = new Map<string, { hash: string; vision: string; taskList: string; full: string }>()
function getEditFailCounts(projectId: string | null): Map<string, number> {
  const key = projectId || '_anon'
  const now = Date.now()
  // Cleanup stale entries
  for (const [k, v] of editFailCache) {
    if (now - v.ts > 10 * 60 * 1000) editFailCache.delete(k)
  }
  // Cap at 500 entries to prevent unbounded growth
  if (editFailCache.size > 500) {
    const entries = [...editFailCache.entries()].sort((a, b) => a[1].ts - b[1].ts)
    while (editFailCache.size > 500) {
      editFailCache.delete(entries.shift()![0])
    }
  }
  let entry = editFailCache.get(key)
  if (!entry) {
    entry = { counts: new Map(), ts: now }
    editFailCache.set(key, entry)
  }
  entry.ts = now
  return entry.counts
}

// ═══════════════════════════════════════════════════════════════════
// Lightweight model auto-routing — suggests optimal model when user
// hasn't explicitly selected one
// ═══════════════════════════════════════════════════════════════════

// Pre-compiled regexes for model classification (avoid recompiling on every request)
const OPUS_RE = /architect|refactor|redesign|migrate|optimize performance|system design|rewrite entire|full rewrite|debug.*complex|build.*from scratch|implement.*auth|implement.*database|convert.*to|design.*api|security audit|performance audit/
const HAIKU_RE = /fix typo|rename|change color|change text|update title|small change|quick fix|add comment|what is|what does|explain|how does|remove.*line|delete.*line|change.*to/

// Repo owner — only this GitHub user can use self-modification tools
const FORGE_OWNER = 'leigh12-93'

// ═══════════════════════════════════════════════════════════════════
// Conditional tool inclusion — only send tool categories the user needs
// Saves 8,000-15,000 tokens per request by excluding unused tools
// ═══════════════════════════════════════════════════════════════════

const TOOL_CATEGORY_PATTERNS: Record<string, RegExp> = {
  project: /scaffold|new project|template|create.*project|start.*project/i,
  github: /github|git\b|push|pull\b|commit|repo|branch|pr\b|merge/i,
  deploy: /deploy|vercel|env\b|domain|sandbox|preview|live/i,
  selfMod: /yourself|self.*mod|upgrade.*self|improve.*self|forge_|your own|your source|your code/i,
  db: /database|table\b|schema|supabase|query|insert|select\b|row|column|db_/i,
  terminal: /run\b|command|terminal|install|server|npm|start.*dev/i,
  audit: /audit|code review|scan|review.*code/i,
  google: /google|sheet|calendar|gmail|drive|spreadsheet|email/i,
  mcp: /mcp|plugin|external.*server/i,
  inspection: /validate|coherence|capture.*preview|reference|diagnose/i,
  generation: /generate.*test|dependency.*health/i,
  webSearch: /search.*web|look.*up|find.*out|documentation|how to\b|what is\b/i,
  persistence: /memory|preference|history|chat.*history/i,
}

function selectTools(
  lastUserText: string,
  ctx: ToolContext,
  isForgeOwner: boolean,
  isFirstMessage: boolean,
  fileCount: number,
): Record<string, any> {
  const text = lastUserText.toLowerCase()

  // Core tools — ALWAYS included
  const tools: Record<string, any> = {
    ...createFileTools(ctx),
    ...createTaskTools(ctx),
    ...createTestingTools(ctx), // build verification is mandatory
  }

  // Planning tools are inside createUtilityTools — we need them always
  // But we can conditionally include sub-categories
  // For now, always include planning + model selection (small overhead)
  // The big savings come from excluding GitHub, Google, Deploy, Self-mod, etc.

  // Check which optional categories match
  const matches = new Set<string>()
  for (const [category, pattern] of Object.entries(TOOL_CATEGORY_PATTERNS)) {
    if (pattern.test(text)) matches.add(category)
  }

  // First message: always include persistence (auto-load memory)
  if (isFirstMessage) matches.add('persistence')

  // Building (multi-file) tasks: include inspection + generation
  if (fileCount > 2 || matches.has('project')) {
    matches.add('inspection')
    matches.add('generation')
  }

  // Include utility tools (planning, inspection, generation, model, search, persistence, mcp)
  // These are relatively small — always include the core utility set
  tools['...utility'] = undefined // placeholder — we'll spread below
  Object.assign(tools, createUtilityTools(ctx))

  // Conditional heavy categories
  if (matches.has('project')) Object.assign(tools, createProjectTools(ctx))
  if (matches.has('github')) Object.assign(tools, createGithubTools(ctx))
  if (matches.has('deploy')) Object.assign(tools, createDeployTools(ctx))
  if (matches.has('selfMod') && isForgeOwner) Object.assign(tools, createSelfModTools(ctx))
  if (matches.has('db')) Object.assign(tools, createDbTools(ctx))
  if (matches.has('terminal')) Object.assign(tools, createTerminalTools(ctx))
  if (matches.has('audit')) Object.assign(tools, createAuditTools(ctx))
  if (matches.has('google')) Object.assign(tools, createGoogleTools(ctx))

  // Clean up placeholder
  delete tools['...utility']

  const toolCount = Object.keys(tools).length
  const estimatedSchemaTokens = Math.round(toolCount * 220) // ~220 tokens per tool schema average
  console.log(`[forge:tools] ${toolCount} tools included (est. ${estimatedSchemaTokens} schema tokens), categories: ${[...matches].join(', ') || 'core-only'}`)

  return tools
}

function classifyModelComplexity(messages: any[], fileCount: number): { model: string; reason: string } {
  const lastMsg = messages.findLast((m: any) => m.role === 'user')
  let text = ''
  if (lastMsg) {
    if (typeof lastMsg.content === 'string') {
      text = lastMsg.content
    } else if (Array.isArray(lastMsg.parts)) {
      text = lastMsg.parts
        .filter((p: any) => p.type === 'text')
        .map((p: any) => p.text || '')
        .join(' ')
    }
  }
  const lower = text.toLowerCase()
  const wordCount = text.split(/\s+/).length

  // Opus indicators: complex architecture, multi-file refactors, system design, debugging
  if (OPUS_RE.test(lower) || (wordCount > 200 && fileCount > 10)) {
    return { model: 'claude-opus-4-20250514', reason: 'Complex task detected — using Opus for best reasoning' }
  }

  // Haiku indicators: simple edits, quick fixes, small questions
  const hasAttachments = lastMsg?.parts?.some((p: any) => p.type === 'file')
  if (!hasAttachments && HAIKU_RE.test(lower) && wordCount < 30 && fileCount <= 5) {
    return { model: 'claude-haiku-4-5-20251001', reason: 'Simple task — using Haiku for speed' }
  }

  // Default: Sonnet for balanced performance
  return { model: 'claude-sonnet-4-20250514', reason: 'Standard task — using Sonnet' }
}

// ═══════════════════════════════════════════════════════════════════
// Dynamic extended thinking budget — more thinking for complex tasks,
// less for simple ones. Better first-attempt code = fewer retries.
// ═══════════════════════════════════════════════════════════════════

const COMPLEX_TASK_RE = /architect|refactor|redesign|migrate|system design|rewrite|full rewrite|build.*from scratch|implement.*auth|implement.*database|design.*api|security|performance|convert.*to|complex|multiple.*files|entire/i
const SIMPLE_TASK_RE = /fix|typo|rename|change.*color|change.*text|update|small|quick|add.*comment|remove.*line|delete.*line|explain|what is|what does|how does/i

function getThinkingBudget(model: string, userText: string, fileCount: number): number {
  if (model === 'claude-sonnet-4-20250514') {
    // Sonnet: modest budget. Thinking at $15/M is cheap but improves code quality.
    // Complex tasks get more; simple get baseline.
    if (COMPLEX_TASK_RE.test(userText) || fileCount > 10) return 6000
    return 4000
  }

  // Opus 4.6: scale thinking budget by complexity
  const wordCount = userText.split(/\s+/).length

  // Complex architecture / multi-file refactors — give it room to think deeply
  if (COMPLEX_TASK_RE.test(userText) || (wordCount > 150 && fileCount > 8)) return 16000

  // Simple edits / questions — minimal thinking needed
  if (SIMPLE_TASK_RE.test(userText) && wordCount < 40) return 3000

  // Default: standard budget
  return 8000
}

// ═══════════════════════════════════════════════════════════════════
// POST handler — AI SDK v6 with Vercel AI Gateway
// ═══════════════════════════════════════════════════════════════════

// Allow long-running streams — Vercel Pro plan supports up to 300s
export const maxDuration = 300

export async function POST(req: Request) {
  const requestId = crypto.randomUUID()

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

  // Concurrent stream limit — max 3 per IP (with TTL to prevent stale entries)
  const now = Date.now()
  for (const [k, v] of activeStreams) {
    if (now - v.ts > STREAM_ENTRY_TTL) activeStreams.delete(k)
  }
  const entry = activeStreams.get(ip)
  const currentStreams = entry?.count || 0
  if (currentStreams >= MAX_CONCURRENT_STREAMS) {
    return new Response(JSON.stringify({ error: 'Too many concurrent requests. Please wait for current responses to complete.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  activeStreams.set(ip, { count: currentStreams + 1, ts: now })

  // Auth check — wrap in try/catch in case session infrastructure fails
  let session
  try {
    session = await getSession()
  } catch {
    session = null
  }
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Authentication required. Please sign in with GitHub.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Request body size guard
  const contentLength = parseInt(req.headers.get('content-length') || '0', 10)
  if (contentLength > 8 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: 'Request too large. Maximum body size is 8MB.' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  interface ChatRequestBody {
    messages: UIMessage[]
    files?: Record<string, string>
    model?: string
    projectName?: string
    projectId?: string
    envVars?: Record<string, string>
    activeFile?: string
    activeFileContent?: string
  }

  let body: ChatRequestBody
  try {
    body = await req.json() as ChatRequestBody
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON in request body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const projectName = typeof body.projectName === 'string' ? body.projectName : 'untitled'
  const projectId = typeof body.projectId === 'string' ? body.projectId : null

  // Verify the user owns the project before proceeding
  if (projectId) {
    const projCheck = await supabaseFetch(`/forge_projects?id=eq.${encodeURIComponent(projectId)}&github_username=eq.${encodeURIComponent(session.githubUsername)}&select=id&limit=1`)
    if (!projCheck.ok || !Array.isArray(projCheck.data) || projCheck.data.length === 0) {
      return new Response(JSON.stringify({ error: 'Project not found or access denied' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
    }
  }

  // ─── BYOK: Load user's API key + Vercel token ──────────────
  let userApiKey: string | null = null
  let userVercelToken: string | null = null
  try {
    const { data: settingsData, ok: settingsOk } = await supabaseFetchDirect(
      `/forge_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}&select=encrypted_api_key,encrypted_vercel_token`,
    )
    if (settingsOk && Array.isArray(settingsData) && settingsData.length > 0) {
      const row = settingsData[0] as any
      if (row.encrypted_api_key) {
        const raw = row.encrypted_api_key.startsWith('v1:') ? row.encrypted_api_key.slice(3) : row.encrypted_api_key
        userApiKey = await decryptToken(raw)
      }
      if (row.encrypted_vercel_token) {
        const raw = row.encrypted_vercel_token.startsWith('v1:') ? row.encrypted_vercel_token.slice(3) : row.encrypted_vercel_token
        userVercelToken = await decryptToken(raw)
      }
    }
  } catch (err: any) {
    console.warn('[chat] Failed to load user credentials, falling back to server keys:', err.message)
  }

  // Create the AI provider — user's key takes priority, falls back to server key
  const aiProvider = userApiKey
    ? createAnthropic({ apiKey: userApiKey })
    : anthropic

  const ALLOWED_MODELS = [
    'claude-sonnet-4-20250514',
    'claude-haiku-4-5-20251001',
    'claude-opus-4-20250514',
    'claude-opus-4-6',
  ]

  // Strip 'anthropic/' prefix from legacy AI Gateway format model IDs
  function normalizeModelId(id: string): string {
    return id.replace(/^anthropic\//, '')
  }

  if (!Array.isArray(body.messages)) {
    return new Response(JSON.stringify({ error: 'messages must be an array.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Post-parse size check
  const bodySize = JSON.stringify(body).length
  if (bodySize > 8 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: 'Request too large. Maximum body size is 8MB.' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Use GitHub token from session (not request body)
  const effectiveGithubToken = session.accessToken || GITHUB_TOKEN

  // Env vars from client
  const clientEnvVars: Record<string, string> = body.envVars && typeof body.envVars === 'object' ? body.envVars : {}

  // Active file context
  const activeFile: string | undefined = body.activeFile
  const activeFileContent: string | undefined = body.activeFileContent

  // Initialize virtual FS from client state
  let safeFiles: Record<string, string> = {}
  if (body.files && typeof body.files === 'object' && !Array.isArray(body.files)) {
    for (const [k, v] of Object.entries(body.files)) {
      if (typeof k === 'string' && typeof v === 'string') safeFiles[k] = v
    }
  }
  const vfs = new VirtualFS(safeFiles)

  let selectedModel: string
  let modelAutoRouted = false
  const rawModel = body.model ? normalizeModelId(body.model) : null
  if (rawModel && ALLOWED_MODELS.includes(rawModel)) {
    selectedModel = rawModel
  } else {
    const fileCount = Object.keys(safeFiles).length
    const classification = classifyModelComplexity(body.messages || [], fileCount)
    selectedModel = classification.model
    modelAutoRouted = true
  }

  // Load project memory for system prompt injection (cached per project, 1-min TTL)
  let projectMemory: Record<string, string> = {}
  if (projectId) {
    const cached = memoryCache.get(projectId)
    if (cached && Date.now() - cached.ts < MEMORY_TTL) {
      projectMemory = cached.data
    } else {
      try {
        const memResult = await supabaseFetch(`/forge_projects?id=eq.${encodeURIComponent(projectId)}&select=memory`)
        if (memResult.ok && Array.isArray(memResult.data) && memResult.data[0]?.memory) {
          const mem = memResult.data[0].memory
          if (typeof mem === 'object' && mem !== null) {
            projectMemory = mem as Record<string, string>
            memoryCache.set(projectId, { data: projectMemory, ts: Date.now() })
          }
        }
      } catch {
        // Non-critical — continue without memory
      }
    }
  }

  // Build file manifest
  const manifest = vfs.manifest()
  let manifestStr: string
  if (manifest.length === 0) {
    manifestStr = '  (empty project)'
  } else if (manifest.length <= 15) {
    manifestStr = manifest.map(f => `  ${f.path} (${f.lines}L, ${(f.size / 1024).toFixed(1)}kb)`).join('\n')
  } else {
    const activeDir = activeFile ? activeFile.substring(0, activeFile.lastIndexOf('/') + 1) : ''
    const dirs = new Map<string, typeof manifest>()
    for (const f of manifest) {
      const slashIdx = f.path.lastIndexOf('/')
      const dir = slashIdx >= 0 ? f.path.substring(0, slashIdx + 1) : ''
      if (!dirs.has(dir)) dirs.set(dir, [])
      dirs.get(dir)!.push(f)
    }
    const lines: string[] = []
    for (const [dir, dirFiles] of dirs) {
      const isActiveDir = activeDir && dir === activeDir
      if (dirFiles.length >= 4 && !isActiveDir) {
        const totalLines = dirFiles.reduce((s, f) => s + f.lines, 0)
        const totalSize = dirFiles.reduce((s, f) => s + f.size, 0)
        lines.push(`  ${dir || '(root)'}  [${dirFiles.length} files, ${totalLines}L, ${(totalSize / 1024).toFixed(1)}kb]`)
      } else {
        for (const f of dirFiles) {
          lines.push(`  ${f.path} (${f.lines}L, ${(f.size / 1024).toFixed(1)}kb)`)
        }
      }
    }
    manifestStr = lines.join('\n')
  }

  // ── Extract last user message text for system prompt tiering + tool selection ──
  const lastUserMessage = (body.messages || []).findLast((m: any) => m.role === 'user') as any
  let lastUserText = ''
  if (lastUserMessage) {
    if (typeof lastUserMessage.content === 'string') {
      lastUserText = lastUserMessage.content
    } else if (Array.isArray(lastUserMessage.parts)) {
      lastUserText = lastUserMessage.parts
        .filter((p: any) => p.type === 'text')
        .map((p: any) => p.text || '')
        .join(' ')
    }
  }

  // In-request task store
  const taskStore = new TaskStore()

  // Edit fail tracking
  const editFailCounts = getEditFailCounts(projectId)

  // Build tool context (needed early for conditional tool selection)
  const ctx: ToolContext = {
    vfs,
    projectName,
    projectId,
    effectiveGithubToken,
    clientEnvVars,
    editFailCounts,
    taskStore,
    defaultTimeout: 30000,
    supabaseFetch,
    githubFetch,
    githubUsername: (session as any).githubUsername || session.user?.name || 'unknown',
    userVercelToken: userVercelToken || undefined,
    googleAccessToken: undefined,
  }

  // Conditional tool selection — only include tools relevant to this message
  const isForgeOwner = session.githubUsername.toLowerCase() === FORGE_OWNER
  const rawMessages0: UIMessage[] = body.messages || []
  const isFirstMessage = rawMessages0.length <= 1
  const allTools = selectTools(lastUserText, ctx, isForgeOwner, isFirstMessage, Object.keys(safeFiles).length)

  // ── Cost optimization: trim conversation history ──────────────
  const MAX_HISTORY = 30
  const FULL_DETAIL_WINDOW = 4
  const MEDIUM_DETAIL_WINDOW = 8

  const rawMessages: UIMessage[] = body.messages || []
  let trimmedMessages = rawMessages.length > MAX_HISTORY
    ? [...rawMessages.slice(0, 2), ...rawMessages.slice(-(MAX_HISTORY - 2))]
    : rawMessages

  // AI SDK v6 uses parts-based UIMessages. Trim old tool parts to save tokens.
  trimmedMessages = trimmedMessages.map((m: any, i: number) => {
    const fromEnd = trimmedMessages.length - i

    // Tier 1: Last 4 messages — full detail
    if (fromEnd <= FULL_DETAIL_WINDOW) return m

    // Tier 2: Messages 5-8 — keep tool names + paths, strip heavy content
    if (fromEnd <= MEDIUM_DETAIL_WINDOW && m.role === 'assistant' && Array.isArray(m.parts)) {
      return {
        ...m,
        parts: m.parts.map((p: any) => {
          if (p.type === 'tool-invocation' || p.type?.startsWith('tool-')) {
            return { ...p, input: { path: p.input?.path || p.args?.path }, output: p.output != null ? { ok: p.output?.ok } : p.result != null ? { ok: p.result?.ok } : {} }
          }
          return p
        }),
      }
    }

    // Tier 3: Older messages — summarize tool parts as text
    if (m.role === 'assistant' && Array.isArray(m.parts)) {
      const toolParts = m.parts.filter((p: any) => p.type === 'tool-invocation' || p.type?.startsWith('tool-'))
      const textParts = m.parts.filter((p: any) => p.type === 'text')
      if (toolParts.length > 0) {
        const summary = toolParts.map((p: any) => {
          const name = p.toolName || p.type?.replace('tool-', '') || 'unknown'
          const path = p.input?.path || ''
          return path ? `${name}(${path})` : name
        }).join(', ')
        return {
          ...m,
          parts: [
            ...textParts,
            { type: 'text', text: `\n[Tools used: ${summary}]` },
          ],
        }
      }
    }

    // Also handle legacy v4 format during transition
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

  // ── Estimate FULL context size (system + tools + messages) ───
  // Build the tiered system prompt — only includes tool/DB/self-mod docs when relevant
  // Inject project memory into the MEMORY_MARKER placeholder
  const memorySection = Object.keys(projectMemory).length > 0
    ? `\n\n## Project Memory (persisted across sessions)\n\`\`\`json\n${JSON.stringify(projectMemory, null, 2)}\n\`\`\``
    : '\n\n(No project memory saved yet — use save_memory to persist insights.)'
  // Inject six-chi.md blueprint — token-optimized with hash-based caching
  const sixChiContent = vfs.read('six-chi.md')
  let sixChiSection = ''
  if (sixChiContent) {
    const hash = sixChiContent.length + ':' + sixChiContent.slice(0, 100)
    const cached = sixChiCache.get(projectId || '_anon')
    const isFirstMessage = trimmedMessages.length <= 1
    const contentChanged = !cached || cached.hash !== hash

    if (isFirstMessage || contentChanged) {
      // Full injection — first message or content was updated
      sixChiSection = `\n\n## Project Blueprint (six-chi.md)\n${sixChiContent.slice(0, 4096)}`
      // Parse and cache the Vision + Task List sections for subsequent messages
      const visionMatch = sixChiContent.match(/## Vision\n([\s\S]*?)(?=\n## )/)?.[1]?.trim() || ''
      const taskMatch = sixChiContent.match(/## Task List\n([\s\S]*?)$/)?.[1]?.trim() || ''
      sixChiCache.set(projectId || '_anon', { hash, vision: visionMatch, taskList: taskMatch, full: sixChiContent })
    } else {
      // Condensed injection — vision + tasks only (~200 tokens vs ~1000)
      sixChiSection = `\n\n## Project Blueprint (six-chi.md — condensed)\nVision: ${cached.vision}\n\nTask List:\n${cached.taskList}\n\n(Full blueprint in six-chi.md — use read_file for architecture/design details)`
    }
  }

  // Cap active file injection at 150 lines — larger files use read_file on demand
  let activeFileSection = ''
  if (activeFile && activeFileContent) {
    const activeLines = activeFileContent.split('\n')
    if (activeLines.length <= 150) {
      activeFileSection = `\n\nUser is currently viewing: ${activeFile}\n\`\`\`\n${activeFileContent}\n\`\`\``
    } else {
      const head = activeLines.slice(0, 50).join('\n')
      const tail = activeLines.slice(-50).join('\n')
      activeFileSection = `\n\nUser is currently viewing: ${activeFile} (${activeLines.length} lines — showing first/last 50, use read_file for full content)\n\`\`\`\n${head}\n\n... [${activeLines.length - 100} lines omitted] ...\n\n${tail}\n\`\`\``
    }
  }

  const systemPromptStr = buildSystemPrompt(lastUserText).replace(MEMORY_MARKER, memorySection)
    + activeFileSection
    + sixChiSection
    + `\n\n---\nProject: "${projectName}"${projectId ? ` (id: ${projectId})` : ''}\nFile manifest:\n${manifestStr}`

  // Token estimation: /3 divisor (not /4) because tool schemas, framing, and code
  // tokenization add ~40% overhead vs prose.
  let messageTokens = JSON.stringify(trimmedMessages).length / 3
  const systemTokens = systemPromptStr.length / 3
  // Dynamic tool schema overhead based on actual included tools (~220 tokens per tool)
  const toolCount = Object.keys(allTools).length
  const TOOL_SCHEMA_OVERHEAD = Math.round(toolCount * 220)
  const SAFETY_BUFFER = 4000
  let estimatedInputTokens = messageTokens + systemTokens + TOOL_SCHEMA_OVERHEAD + SAFETY_BUFFER

  const MODEL_CONTEXT_LIMITS: Record<string, number> = {
    'claude-sonnet-4-20250514': 200000,
    'claude-opus-4-20250514': 200000,
    'claude-opus-4-6': 680000,       // Opus 4.6 supports up to 1M context
    'claude-haiku-4-5-20251001': 200000,
  }
  const contextLimit = MODEL_CONTEXT_LIMITS[selectedModel] || 200000

  // Per-model output token budgets
  const MODEL_MAX_OUTPUT: Record<string, number> = {
    'claude-opus-4-6': 128000,        // Opus 4.6 supports much higher output
    'claude-opus-4-20250514': 64000,
  }

  // Per-model step budgets — higher = more agentic loops before stopping
  // These need to be high enough that the AI never stops mid-task
  const MODEL_MAX_STEPS: Record<string, number> = {
    'claude-opus-4-6': 120,
    'claude-opus-4-20250514': 100,
    'claude-sonnet-4-20250514': 80,
    'claude-haiku-4-5-20251001': 60,
  }

  // ── Layer 2: Auto-compaction via Haiku summarization ──────────
  // Triggers on: token threshold (70%) OR message count (>30 messages = always compact)
  let compactionOccurred = false
  let compactedTokensSaved = 0
  const shouldCompact = (estimatedInputTokens > contextLimit * 0.70 && trimmedMessages.length > 6)
    || trimmedMessages.length > 30 // Safety net: always compact long conversations
  if (shouldCompact) {
    const preCompactionTokens = estimatedInputTokens
    const result = await compactMessages(trimmedMessages, projectId, estimatedInputTokens, contextLimit)
    trimmedMessages = result.messages
    compactionOccurred = result.compacted
    if (compactionOccurred) {
      // Recalculate token estimates after compaction
      messageTokens = JSON.stringify(trimmedMessages).length / 3
      estimatedInputTokens = messageTokens + systemTokens + TOOL_SCHEMA_OVERHEAD + SAFETY_BUFFER
      compactedTokensSaved = Math.round(preCompactionTokens - estimatedInputTokens)
      console.log(`[forge] rid=${requestId} Compaction saved ~${compactedTokensSaved} tokens (${Math.round(preCompactionTokens)} → ${Math.round(estimatedInputTokens)})`)
    }
  }

  // Track whether this request's stream count has been decremented
  let streamCounted = true

  const DESIRED_MAX_TOKENS = MODEL_MAX_OUTPUT[selectedModel] || 64000
  const MIN_OUTPUT_TOKENS = 4000
  let availableForOutput = contextLimit - estimatedInputTokens
  let dynamicMaxTokens = Math.min(DESIRED_MAX_TOKENS, Math.max(MIN_OUTPUT_TOKENS, availableForOutput))

  // If even MIN_OUTPUT_TOKENS won't fit, reject early with a clear error
  if (availableForOutput < MIN_OUTPUT_TOKENS) {
    // Decrement concurrent stream count (only once)
    if (streamCounted) {
      streamCounted = false
      const se = activeStreams.get(ip)
      if (!se || se.count <= 1) activeStreams.delete(ip)
      else activeStreams.set(ip, { count: se.count - 1, ts: Date.now() })
    }

    console.warn(`[forge] rid=${requestId} Context overflow: est_input=${Math.round(estimatedInputTokens)} available=${availableForOutput} limit=${contextLimit}`)
    return new Response(JSON.stringify({
      error: `Your conversation is too long for the ${contextLimit / 1000}K context window. `
        + `Estimated input: ~${Math.round(estimatedInputTokens / 1000)}K tokens, leaving no room for a response. `
        + `Clear your chat history or shorten your message.`,
    }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const contextUsage = estimatedInputTokens / contextLimit
  const contextWarning: 'critical' | 'warning' | null = contextUsage > 0.85
    ? 'critical'
    : contextUsage > 0.65
      ? 'warning'
      : null

  // Sanitize tool part inputs before conversion — Anthropic API requires
  // tool_use.input to be a valid dict, but the AI SDK passes input as-is.
  // Client-sent UIMessages may have input: undefined, null, or string.
  trimmedMessages = trimmedMessages.map((m: any) => {
    if (m.role !== 'assistant' || !Array.isArray(m.parts)) return m
    let modified = false
    const sanitizedParts = m.parts.map((p: any) => {
      // Check all tool-related part types
      const isToolPart = p.type?.startsWith('tool-') || p.type === 'dynamic-tool'
      if (!isToolPart) return p
      // Ensure input is always a proper object (dict)
      const input = p.input
      if (input !== null && input !== undefined && typeof input === 'object' && !Array.isArray(input)) {
        return p // Already a valid dict
      }
      modified = true
      return { ...p, input: input != null ? { _raw: String(input) } : {} }
    })
    return modified ? { ...m, parts: sanitizedParts } : m
  })

  // Convert UIMessages to ModelMessages (v6 — async)
  let messages
  try {
    messages = await convertToModelMessages(trimmedMessages)
  } catch {
    // Fallback for legacy format or malformed messages
    messages = trimmedMessages.map((m: { role: string; content?: string; parts?: any[] }) => {
      let text = ''
      if (typeof m.content === 'string') {
        text = m.content
      } else if (Array.isArray(m.parts)) {
        text = m.parts.filter((p: any) => p.type === 'text').map((p: any) => p.text || '').join('')
      }
      return {
        role: m.role as 'user' | 'assistant',
        content: text || '',
      }
    })
  }

  // Save user message to database
  if (projectId && messages.length > 0) {
    const lastMessage = messages[messages.length - 1]
    if (lastMessage.role === 'user') {
      try {
        const userContent = typeof lastMessage.content === 'string'
          ? lastMessage.content
          : Array.isArray(lastMessage.content)
            ? lastMessage.content.filter((p: any) => p.type === 'text').map((p: any) => p.text || '').join('')
            : ''
        await supabaseFetch('/forge_chat_messages', {
          method: 'POST',
          body: JSON.stringify({
            project_id: projectId,
            role: 'user',
            content: userContent,
          }),
        })
      } catch (error) {
        console.error('Failed to save user message:', error)
      }
    }
  }

  // Global timeout
  const streamAbort = new AbortController()
  const streamTimeout = setTimeout(() => streamAbort.abort('Stream timeout: 10 minutes exceeded'), 10 * 60 * 1000)

  try {
    // AI SDK v6: Use createUIMessageStream for custom data + streamText
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        // Send model suggestion as transient data part
        if (modelAutoRouted) {
          const classification = classifyModelComplexity(body.messages || [], Object.keys(safeFiles).length)
          writer.write({
            type: 'data-forge-meta',
            data: JSON.stringify({ type: 'model_suggestion', model: selectedModel, reason: classification.reason }),
          } as any)
        }

        // Send context usage warning if approaching limit
        if (contextWarning) {
          writer.write({
            type: 'data-forge-meta',
            data: JSON.stringify({
              type: 'context_warning',
              level: contextWarning,
              estimatedUsage: Math.round(contextUsage * 100),
            }),
          } as any)
        }

        // Notify client if compaction occurred
        if (compactionOccurred) {
          writer.write({
            type: 'data-forge-meta',
            data: JSON.stringify({
              type: 'compaction_notice',
              tokensSaved: compactedTokensSaved,
            }),
          } as any)
        }

        // Use @ai-sdk/anthropic provider — BYOK key if available, else server key
        const result = streamText({
          model: aiProvider(selectedModel),
          system: systemPromptStr,
          messages,
          maxOutputTokens: dynamicMaxTokens,
          stopWhen: stepCountIs(MODEL_MAX_STEPS[selectedModel] || 70),
          abortSignal: streamAbort.signal,
          tools: allTools,
          // Force tool use on first 2 steps to prevent the model from stopping
          // with a text-only response before actually building anything.
          // NOTE: toolChoice 'required' is INCOMPATIBLE with Anthropic extended thinking
          // (API error: "Thinking may not be enabled when tool_choice forces tool use")
          // so we skip it for models using thinking (Opus 4.6 + Sonnet 4).
          // The system prompt instructs continuous tool calling instead.
          ...(!['claude-opus-4-6', 'claude-sonnet-4-20250514'].includes(selectedModel) ? {
            toolChoice: 'required' as const,
            prepareStep: ({ stepNumber }: { stepNumber: number }) => ({
              toolChoice: stepNumber < 2 ? ('required' as const) : ('auto' as const),
            }),
          } : {}),
          // Enable Anthropic prompt caching — 90% input token discount on cached prefix
          // Extended thinking: improves first-attempt code quality → fewer retries → net cheaper
          // Opus 4.6: dynamic budget scaled by task complexity (2K-16K)
          // Sonnet 4: modest budget (4K) — cheap thinking ($15/M) but meaningfully better code
          providerOptions: {
            anthropic: {
              cacheControl: { type: 'ephemeral' },
              ...((selectedModel === 'claude-opus-4-6' || selectedModel === 'claude-sonnet-4-20250514') ? {
                thinking: { type: 'enabled', budgetTokens: getThinkingBudget(selectedModel, lastUserText, Object.keys(safeFiles).length) },
              } : {}),
            },
          },

          onFinish: async (event) => {
            clearTimeout(streamTimeout)

            // Decrement concurrent stream count (only once)
            if (streamCounted) {
              streamCounted = false
              const se = activeStreams.get(ip)
              if (!se || se.count <= 1) activeStreams.delete(ip)
              else activeStreams.set(ip, { count: se.count - 1, ts: Date.now() })
            }

            console.log(`[forge] rid=${requestId} ${event.totalUsage?.totalTokens || 0} tokens, ${event.steps?.length || 0} steps`)

            // Server-side usage tracking per user
            if (event.totalUsage && session?.user) {
              const userId = (session as any).githubUsername || 'unknown'
              const prev = usageTracker.get(userId) || { tokens: 0, requests: 0, ts: Date.now() }
              prev.tokens += event.totalUsage.totalTokens || 0
              prev.requests += 1
              prev.ts = Date.now()
              usageTracker.set(userId, prev)
              // Evict oldest entries if over cap
              if (usageTracker.size > MAX_USAGE_ENTRIES) {
                const sorted = [...usageTracker.entries()].sort((a, b) => a[1].ts - b[1].ts)
                while (usageTracker.size > MAX_USAGE_ENTRIES) {
                  usageTracker.delete(sorted.shift()![0])
                }
              }
              console.log(`[forge:usage] user=${userId} req_tokens=${event.totalUsage.totalTokens} cumulative=${prev.tokens} requests=${prev.requests}`)
            }

            // Save assistant message to database
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

        // Merge the streamText result into our UIMessageStream
        writer.merge(result.toUIMessageStream({
          // Stream reasoning/thinking blocks to the client so the user
          // can see what the AI is thinking (Opus 4.6 extended thinking)
          sendReasoning: true,
          // Send usage as message metadata on the final message
          messageMetadata: ({ part }) => {
            if (part.type === 'finish') {
              return {
                usage: {
                  inputTokens: part.totalUsage?.inputTokens ?? 0,
                  outputTokens: part.totalUsage?.outputTokens ?? 0,
                  totalTokens: part.totalUsage?.totalTokens ?? 0,
                },
                model: selectedModel,
                autoRouted: modelAutoRouted,
              }
            }
            return undefined
          },
        }))
      },
    })

    return createUIMessageStreamResponse({ stream })
  } catch (error) {
    clearTimeout(streamTimeout)

    // Decrement concurrent stream count on error (only once)
    if (streamCounted) {
      streamCounted = false
      const se = activeStreams.get(ip)
      if (!se || se.count <= 1) activeStreams.delete(ip)
      else activeStreams.set(ip, { count: se.count - 1, ts: Date.now() })
    }

    const err = error instanceof Error ? error : new Error(String(error))
    const msg = err.message || ''
    console.error(`[forge] rid=${requestId} Stream error:`, err)

    // Classify the error for the client
    let status = 500
    let clientMessage = 'Stream failed unexpectedly. Please try again.'

    if (msg.includes('rate') || msg.includes('429') || msg.includes('overloaded')) {
      status = 429
      clientMessage = 'Claude API is rate limited or overloaded. Wait a moment and retry.'
    } else if (msg.includes('401') || msg.includes('auth') || msg.includes('key')) {
      status = 401
      clientMessage = 'API authentication failed. Check your Anthropic API key.'
    } else if (msg.includes('context') || msg.includes('too long') || msg.includes('token') || msg.includes('max_tokens exceed')) {
      status = 413
      clientMessage = 'Conversation too long for the model context window. Clear your chat history or shorten your message.'
    } else if (msg.includes('abort') || msg.includes('timeout') || msg.includes('cancel')) {
      status = 408
      clientMessage = 'Request timed out. Try a shorter prompt or fewer files.'
    } else if (msg.includes('content') && msg.includes('filter')) {
      status = 422
      clientMessage = 'Content was filtered by safety systems. Rephrase your request.'
    }

    return new Response(JSON.stringify({ error: clientMessage }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
