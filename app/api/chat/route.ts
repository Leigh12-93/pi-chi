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
// Lightweight model auto-routing — suggests optimal model when user
// hasn't explicitly selected one
// ═══════════════════════════════════════════════════════════════════
function classifyModelComplexity(messages: any[], fileCount: number): { model: string; reason: string } {
  const lastMsg = messages.findLast((m: any) => m.role === 'user')
  // Extract text from UIMessage parts or legacy content string
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

  // Opus indicators: complex architecture, multi-file refactors, system design
  const opusKeywords = ['architect', 'refactor', 'redesign', 'migrate', 'optimize performance', 'system design', 'rewrite entire', 'full rewrite']
  if (opusKeywords.some(k => lower.includes(k)) || (wordCount > 200 && fileCount > 10)) {
    return { model: 'claude-opus-4-20250514', reason: 'Complex task detected — using Opus for best reasoning' }
  }

  // Haiku indicators: simple edits, quick fixes, small changes
  const haikuKeywords = ['fix typo', 'rename', 'change color', 'change text', 'update title', 'small change', 'quick fix', 'add comment']
  if (haikuKeywords.some(k => lower.includes(k)) || (wordCount < 20 && fileCount <= 3)) {
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

  // Concurrent stream limit — max 3 per IP
  const currentStreams = activeStreams.get(ip) || 0
  if (currentStreams >= MAX_CONCURRENT_STREAMS) {
    return new Response(JSON.stringify({ error: 'Too many concurrent requests. Please wait for current responses to complete.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  activeStreams.set(ip, currentStreams + 1)

  // Auth check
  const session = await getSession()
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
  const MAX_HISTORY = 40
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
            return { ...p, input: { path: p.input?.path }, output: p.output?.ok !== undefined ? { ok: p.output.ok } : undefined }
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
    ...createSelfModTools(ctx),
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

        // Use @ai-sdk/anthropic provider for prompt caching support
        const result = streamText({
          model: anthropic(selectedModel),
          system: SYSTEM_PROMPT
            + (promptExample ? `\n\n## Structural Guide for This Request\n${promptExample}` : '')
            + `\n\n---\nProject: "${projectName}"${projectId ? ` (id: ${projectId})` : ''}\nFile manifest:\n${manifestStr}`
            + (activeFile && activeFileContent
              ? `\n\nUser is currently viewing: ${activeFile}\n\`\`\`\n${activeFileContent}\n\`\`\``
              : ''),
          messages,
          stopWhen: stepCountIs(50),
          abortSignal: streamAbort.signal,
          tools: allTools,
          // Enable Anthropic prompt caching — 90% input token discount on cached prefix
          providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } },
          },

          onFinish: async (event) => {
            clearTimeout(streamTimeout)

            // Decrement concurrent stream count
            const count = activeStreams.get(ip) || 1
            if (count <= 1) activeStreams.delete(ip)
            else activeStreams.set(ip, count - 1)

            console.log(`[forge] rid=${requestId} ${event.totalUsage?.totalTokens || 0} tokens, ${event.steps?.length || 0} steps`)

            // Server-side usage tracking per user
            if (event.totalUsage && session?.user) {
              const userId = (session as any).githubUsername || 'unknown'
              const prev = usageTracker.get(userId) || { tokens: 0, requests: 0, ts: Date.now() }
              prev.tokens += event.totalUsage.totalTokens || 0
              prev.requests += 1
              prev.ts = Date.now()
              usageTracker.set(userId, prev)
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

    // Decrement concurrent stream count on error
    const count = activeStreams.get(ip) || 1
    if (count <= 1) activeStreams.delete(ip)
    else activeStreams.set(ip, count - 1)

    console.error(`[forge] rid=${requestId} Stream error:`, error)
    return new Response(JSON.stringify({ error: 'Stream failed unexpectedly. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
