import { streamText, convertToCoreMessages, StreamData } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { chatLimiter } from '@/lib/rate-limit'
import { TaskStore } from '@/lib/background-tasks'
import { getSession } from '@/lib/auth'
import { SYSTEM_PROMPT } from '@/lib/system-prompt'
import { VirtualFS } from '@/lib/virtual-fs'
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
const activeStreams = new Map<string, number>()
const MAX_CONCURRENT_STREAMS = 3

const usageTracker = new Map<string, { tokens: number; requests: number; ts: number }>()

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
// POST handler
// ═══════════════════════════════════════════════════════════════════

export async function POST(req: Request) {
  const requestId = crypto.randomUUID()

  // Rate limit — 20 requests/minute per IP
  // NOTE: x-forwarded-for is trusted here because this runs on Vercel which sets it reliably.
  // If self-hosting behind a different proxy, configure trusted proxy headers accordingly.
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

  // Concurrent stream limit — max 3 per IP
  const currentStreams = activeStreams.get(ip) || 0
  if (currentStreams >= MAX_CONCURRENT_STREAMS) {
    return new Response(JSON.stringify({ error: 'Too many concurrent requests. Please wait for current responses to complete.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  activeStreams.set(ip, currentStreams + 1)

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

  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON in request body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const projectName = body.projectName || 'untitled'
  const projectId = body.projectId || null
  const ALLOWED_MODELS = ['claude-sonnet-4-20250514', 'claude-haiku-35-20241022', 'claude-opus-4-20250514']
  const selectedModel = ALLOWED_MODELS.includes(body.model) ? body.model : 'claude-sonnet-4-20250514'

  if (!Array.isArray(body.messages)) {
    return new Response(JSON.stringify({ error: 'messages must be an array.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Post-parse size check for chunked transfers (content-length may be absent)
  // Check entire body, not just files — a huge messages array could also blow the limit
  const bodySize = JSON.stringify(body).length
  if (bodySize > 8 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: 'Request too large. Maximum body size is 8MB.' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Use GitHub token from session (not request body) — prevents token leaking via logs
  const effectiveGithubToken = session.accessToken || GITHUB_TOKEN

  // Env vars from client (user-provided via request_env_vars card)
  const clientEnvVars: Record<string, string> = body.envVars && typeof body.envVars === 'object' ? body.envVars : {}

  // Active file context — reduces unnecessary read_file calls
  const activeFile: string | undefined = body.activeFile
  const activeFileContent: string | undefined = body.activeFileContent

  // Initialize virtual FS from client state (validate input)
  let safeFiles: Record<string, string> = {}
  if (body.files && typeof body.files === 'object' && !Array.isArray(body.files)) {
    for (const [k, v] of Object.entries(body.files)) {
      if (typeof k === 'string' && typeof v === 'string') safeFiles[k] = v
    }
  }
  const vfs = new VirtualFS(safeFiles)

  // In-request task store for background operations
  const taskStore = new TaskStore()

  // Track edit_file failures per path — after 3 failures, suggest write_file
  // Uses module-level cache so counts persist across user messages
  const editFailCounts = getEditFailCounts(projectId)

  // Build file manifest for system context (lean — no content)
  // Smart grouping: directories with 4+ files get collapsed unless they contain the active file
  const manifest = vfs.manifest()
  let manifestStr: string
  if (manifest.length === 0) {
    manifestStr = '  (empty project)'
  } else if (manifest.length <= 15) {
    // Small project — show all files
    manifestStr = manifest.map(f => `  ${f.path} (${f.lines}L, ${(f.size / 1024).toFixed(1)}kb)`).join('\n')
  } else {
    // Group by directory, collapse large dirs
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

  const streamData = new StreamData()

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
        streamData.append({ type: 'warning', message: 'Message history may not be saved for this session.' })
      }
    }
  }

  // Global timeout: abort the entire streamText operation after 5 minutes
  // Prevents indefinitely hanging requests if the model or tool execution stalls.
  const streamAbort = new AbortController()
  const streamTimeout = setTimeout(() => streamAbort.abort('Stream timeout: 5 minutes exceeded'), 5 * 60 * 1000)

  // ── Build tool context shared by all tool factories ──────────
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
  }

  try {
    const result = streamText({
      // Prompt caching: system prompt + tool definitions cached by Anthropic.
      // 90% input token discount on cached prefix for subsequent requests in same session.
      model: anthropic(selectedModel, { cacheControl: true }),
      system: SYSTEM_PROMPT
        + `\n\n---\nProject: "${projectName}"${projectId ? ` (id: ${projectId})` : ''}\nFile manifest:\n${manifestStr}`
        + (activeFile && activeFileContent
          ? `\n\nUser is currently viewing: ${activeFile}\n\`\`\`\n${activeFileContent}\n\`\`\``
          : ''),
      messages,
      maxSteps: 50,
      abortSignal: streamAbort.signal,
      tools: {
        ...createFileTools(ctx),
        ...createProjectTools(ctx),
        ...createGithubTools(ctx),
        ...createDeployTools(ctx),
        ...createSelfModTools(ctx),
        ...createDbTools(ctx),
        ...createUtilityTools(ctx),
      },

      onFinish: async (event) => {
        clearTimeout(streamTimeout)

        // Decrement concurrent stream count
        const count = activeStreams.get(ip) || 1
        if (count <= 1) activeStreams.delete(ip)
        else activeStreams.set(ip, count - 1)

        console.log(`[forge] rid=${requestId} ${event.usage?.totalTokens || 0} tokens, ${event.steps?.length || 0} steps`)

        // Notify client if stream was aborted due to timeout
        if (streamAbort.signal.aborted) {
          streamData.append({ type: 'error', message: 'Response timed out after 5 minutes. Try a simpler request.' })
        }

        // Stream real token usage to client
        if (event.usage) {
          streamData.append({
            type: 'usage',
            promptTokens: event.usage.promptTokens,
            completionTokens: event.usage.completionTokens,
            totalTokens: event.usage.totalTokens,
          })
        }

        // Server-side usage tracking per user
        if (event.usage && session?.user) {
          const userId = (session as any).githubUsername || 'unknown'
          const prev = usageTracker.get(userId) || { tokens: 0, requests: 0, ts: Date.now() }
          prev.tokens += event.usage.totalTokens || 0
          prev.requests += 1
          prev.ts = Date.now()
          usageTracker.set(userId, prev)
          console.log(`[forge:usage] user=${userId} req_tokens=${event.usage.totalTokens} cumulative=${prev.tokens} requests=${prev.requests}`)
        }

        // Save assistant message to database BEFORE closing stream
        // so we can still warn the client if the save fails.
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
            try {
              streamData.append({ type: 'warning', message: 'Chat history could not be saved. Your work is safe but this conversation may not persist.' })
            } catch { /* stream closing race — non-fatal */ }
          }
        }

        try { await streamData.close() } catch { /* stream already closed */ }
      },
    })

    return result.toDataStreamResponse({ data: streamData })
  } catch (error) {
    clearTimeout(streamTimeout)

    // Decrement concurrent stream count on error
    const count = activeStreams.get(ip) || 1
    if (count <= 1) activeStreams.delete(ip)
    else activeStreams.set(ip, count - 1)

    console.error(`[forge] rid=${requestId} Stream error:`, error)
    try {
      streamData.append({ type: 'error', message: error instanceof Error ? error.message : 'Stream failed' })
      await streamData.close()
    } catch { /* stream already closed */ }
    return new Response(JSON.stringify({ error: 'Stream failed unexpectedly. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
