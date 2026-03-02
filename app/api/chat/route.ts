import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  UIMessage,
} from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { chatLimiter } from '@/lib/rate-limit'
import { TaskStore } from '@/lib/background-tasks'
import { getSession } from '@/lib/auth'
import { SYSTEM_PROMPT } from '@/lib/system-prompt'
import { getPromptExample } from '@/lib/prompt-examples'
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
    return { model: 'claude-haiku-35-20241022', reason: 'Simple task — using Haiku for speed' }
  }

  // Default: Sonnet for balanced performance
  return { model: 'claude-sonnet-4-20250514', reason: 'Standard task — using Sonnet' }
}

// ═══════════════════════════════════════════════════════════════════
// POST handler — AI SDK v6 with Vercel AI Gateway
// ═══════════════════════════════════════════════════════════════════

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

  const ALLOWED_MODELS = [
    'claude-sonnet-4-20250514',
    'claude-haiku-35-20241022',
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

  // In-request task store
  const taskStore = new TaskStore()

  // Edit fail tracking
  const editFailCounts = getEditFailCounts(projectId)

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
  // Build the system prompt string early so we can measure it
  const systemPromptStr = SYSTEM_PROMPT
    + (activeFile && activeFileContent
      ? `\n\nUser is currently viewing: ${activeFile}\n\`\`\`\n${activeFileContent}\n\`\`\``
      : '')
    + `\n\n---\nProject: "${projectName}"${projectId ? ` (id: ${projectId})` : ''}\nFile manifest:\n${manifestStr}`

  // Token estimation: JSON.stringify/4 underestimates real Anthropic token count
  // because tool schemas, message framing, and code tokenization add ~40% overhead.
  // Use /3 instead of /4 for a safer estimate.
  let messageTokens = JSON.stringify(trimmedMessages).length / 3
  const systemTokens = systemPromptStr.length / 3
  const TOOL_SCHEMA_OVERHEAD = 20000 // ~40 tools with Zod schemas, descriptions, enums
  const SAFETY_BUFFER = 4000 // framing tokens, message metadata, caching headers
  let estimatedInputTokens = messageTokens + systemTokens + TOOL_SCHEMA_OVERHEAD + SAFETY_BUFFER

  const MODEL_CONTEXT_LIMITS: Record<string, number> = {
    'claude-sonnet-4-20250514': 200000,
    'claude-opus-4-20250514': 200000,
    'claude-opus-4-6': 680000,       // Opus 4.6 supports up to 1M context
    'claude-haiku-35-20241022': 200000,
  }
  const contextLimit = MODEL_CONTEXT_LIMITS[selectedModel] || 200000

  // Per-model output token budgets
  const MODEL_MAX_OUTPUT: Record<string, number> = {
    'claude-opus-4-6': 128000,        // Opus 4.6 supports much higher output
    'claude-opus-4-20250514': 64000,
  }

  // Per-model step budgets (more complex models can do more agentic loops)
  const MODEL_MAX_STEPS: Record<string, number> = {
    'claude-opus-4-6': 75,
    'claude-opus-4-20250514': 60,
  }

  // ── Layer 2: Auto-compaction via Haiku summarization ──────────
  // Triggers on: token threshold (50%) OR message count (>20 messages = always compact)
  let compactionOccurred = false
  let compactedTokensSaved = 0
  const shouldCompact = (estimatedInputTokens > contextLimit * 0.50 && trimmedMessages.length > 6)
    || trimmedMessages.length > 20 // Safety net: always compact long conversations
  if (shouldCompact) {
    const preCompactionTokens = estimatedInputTokens
    const result = await compactMessages(trimmedMessages, projectId, estimatedInputTokens, contextLimit)
    trimmedMessages = result.messages
    compactionOccurred = result.compacted
    if (compactionOccurred) {
      // Recalculate token estimates after compaction
      messageTokens = JSON.stringify(trimmedMessages).length / 4
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
  const streamTimeout = setTimeout(() => streamAbort.abort('Stream timeout: 5 minutes exceeded'), 5 * 60 * 1000)

  // Build tool context
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
  }

  // Structural prompt example
  const lastUserMsg = messages.findLast((m: any) => m.role === 'user')
  const promptExample = lastUserMsg ? getPromptExample(typeof lastUserMsg.content === 'string' ? lastUserMsg.content : '') : null

  const allTools = {
    ...createFileTools(ctx),
    ...createProjectTools(ctx),
    ...createGithubTools(ctx),
    ...createDeployTools(ctx),
    // Self-mod tools restricted to repo owner only (S-16 security gate)
    ...(session.githubUsername.toLowerCase() === FORGE_OWNER ? createSelfModTools(ctx) : {}),
    ...createDbTools(ctx),
    ...createUtilityTools(ctx),
  }

  try {
    // AI SDK v6: Use createUIMessageStream for custom data + streamText
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        // Send model suggestion as transient data part
        if (modelAutoRouted) {
          const classification = classifyModelComplexity(body.messages || [], Object.keys(safeFiles).length)
          writer.write({
            type: 'data' as any,
            data: JSON.stringify({ type: 'model_suggestion', model: selectedModel, reason: classification.reason }),
          } as any)
        }

        // Send context usage warning if approaching limit
        if (contextWarning) {
          writer.write({
            type: 'data' as any,
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
            type: 'data' as any,
            data: JSON.stringify({
              type: 'compaction_notice',
              tokensSaved: compactedTokensSaved,
            }),
          } as any)
        }

        // Use @ai-sdk/anthropic provider for prompt caching support
        const result = streamText({
          model: anthropic(selectedModel),
          system: systemPromptStr
            + (promptExample ? `\n\n## Structural Guide for This Request\n${promptExample}` : ''),
          messages,
          maxOutputTokens: dynamicMaxTokens,
          stopWhen: stepCountIs(MODEL_MAX_STEPS[selectedModel] || 50),
          abortSignal: streamAbort.signal,
          tools: allTools,
          // Enable Anthropic prompt caching — 90% input token discount on cached prefix
          // For Opus 4.6, also enable extended thinking for better agentic reasoning
          providerOptions: {
            anthropic: {
              cacheControl: { type: 'ephemeral' },
              ...(selectedModel === 'claude-opus-4-6' ? {
                thinking: { type: 'enabled', budgetTokens: 32000 },
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
