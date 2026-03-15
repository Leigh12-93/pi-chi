import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  UIMessage,
} from 'ai'
import { anthropic, createAnthropic } from '@ai-sdk/anthropic'
import { logger } from '@/lib/logger'
import { chatLimiter } from '@/lib/rate-limit'
import { TaskStore } from '@/lib/background-tasks'
import { getSession, decryptToken } from '@/lib/auth'
import { supabaseFetch as supabaseFetchDirect } from '@/lib/supabase-fetch'
import { getMessageText } from '@/lib/chat/tool-utils'
import { VirtualFS } from '@/lib/virtual-fs'
import { compactMessages } from '@/lib/compaction'
import { GITHUB_TOKEN, githubFetch } from '@/lib/github'
import { supabaseFetch } from '@/lib/supabase-fetch'
import type { ToolContext } from '@/lib/tools'

// Extracted modules
import {
  MAX_CONCURRENT_STREAMS, STREAM_ENTRY_TTL, MAX_USAGE_ENTRIES,
  activeStreams, usageTracker, getEditFailCounts,
} from '@/lib/chat/rate-limiter'
import {
  ALLOWED_MODELS, MODEL_CONTEXT_LIMITS, MODEL_MAX_OUTPUT, MODEL_MAX_STEPS,
  normalizeModelId, classifyModelComplexity, getThinkingBudget,
} from '@/lib/chat/model-router'
import { selectTools } from '@/lib/chat/tool-selector'
import {
  buildFileManifest, loadProjectMemory,
  buildSixChiSection, buildActiveFileSection, assembleSystemPrompt,
} from '@/lib/chat/context-builder'
import { processMessages } from '@/lib/chat/message-processor'

// Repo owner — only this GitHub user can use self-modification tools
const PI_OWNER = 'leigh12-93'

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
  } catch (err) {
    console.error('[chat] Session check failed:', err instanceof Error ? err.message : err)
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
    brainName?: string
    brainStatus?: string
  }

  let body: ChatRequestBody
  try {
    body = await req.json() as ChatRequestBody
  } catch (err) {
    console.error('[chat] JSON parse failed:', err instanceof Error ? err.message : err)
    return new Response(JSON.stringify({ error: 'Invalid JSON in request body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const projectName = typeof body.projectName === 'string' ? body.projectName : 'untitled'
  const projectId = typeof body.projectId === 'string' ? body.projectId : null

  // Verify the user owns the project before proceeding
  if (projectId) {
    const projCheck = await supabaseFetch(`/pi_projects?id=eq.${encodeURIComponent(projectId)}&github_username=eq.${encodeURIComponent(session.githubUsername)}&select=id&limit=1`)
    if (!projCheck.ok || !Array.isArray(projCheck.data) || projCheck.data.length === 0) {
      return new Response(JSON.stringify({ error: 'Project not found or access denied' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
    }
  }

  let userApiKey: string | null = null
  let userVercelToken: string | null = null
  try {
    const { data: settingsData, ok: settingsOk } = await supabaseFetchDirect(
      `/pi_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}&select=encrypted_api_key,encrypted_vercel_token`,
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[chat] Failed to load user credentials, falling back to server keys:', msg)
  }

  // Create the AI provider — user's key takes priority, falls back to server key
  const aiProvider = userApiKey
    ? createAnthropic({ apiKey: userApiKey })
    : anthropic

  if (!Array.isArray(body.messages)) {
    return new Response(JSON.stringify({ error: 'messages must be an array.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Validate message array bounds and structure
  if (body.messages.length > 200) {
    return new Response(JSON.stringify({ error: 'Too many messages. Maximum 200 per request.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  for (const msg of body.messages) {
    if (!msg || typeof msg !== 'object') continue
    if (msg.role && !['user', 'assistant', 'system'].includes(msg.role)) {
      return new Response(JSON.stringify({ error: `Invalid message role: ${String(msg.role).slice(0, 20)}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
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

  // Brain identity — when set, system prompt uses Pi-Chi management personality
  const brainName: string | undefined = typeof body.brainName === 'string' ? body.brainName : undefined
  const brainStatus: string | undefined = typeof body.brainStatus === 'string' ? body.brainStatus : undefined

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

  // Load project memory (cached per project, 1-min TTL)
  const projectMemory = await loadProjectMemory(projectId)

  // Build context sections
  const manifestStr = buildFileManifest(vfs, activeFile)
  const sixChiSection = buildSixChiSection(vfs, projectId, (body.messages || []).length)
  const activeFileSection = buildActiveFileSection(activeFile, activeFileContent)

  const lastUserMessage = (body.messages || []).findLast((m: any) => m.role === 'user')
  const lastUserText = lastUserMessage ? getMessageText(lastUserMessage) : ''

  // In-request task store
  const taskStore = new TaskStore()

  // Edit fail tracking
  const editFailCounts = getEditFailCounts(projectId)

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
    userVercelToken: userVercelToken || undefined,
    googleAccessToken: undefined,
  }

  // Conditional tool selection
  const isPiOwner = session.githubUsername.toLowerCase() === PI_OWNER
  const rawMessages0: UIMessage[] = body.messages || []
  const isFirstMessage = rawMessages0.length <= 1
  const allTools = selectTools(lastUserText, ctx, isPiOwner, isFirstMessage, Object.keys(safeFiles).length)

  // Process messages: trim, strip older tool parts, dedup IDs, sanitize
  let trimmedMessages = processMessages(body.messages || [])

  // Assemble system prompt
  const systemPromptStr = assembleSystemPrompt({
    lastUserText, brainName, brainStatus, projectMemory,
    activeFileSection, sixChiSection, projectName, projectId, manifestStr,
  })

  // Token estimation
  let messageTokens = JSON.stringify(trimmedMessages).length / 3
  const systemTokens = systemPromptStr.length / 3
  const toolCount = Object.keys(allTools).length
  const TOOL_SCHEMA_OVERHEAD = Math.round(toolCount * 220)
  const SAFETY_BUFFER = 4000
  let estimatedInputTokens = messageTokens + systemTokens + TOOL_SCHEMA_OVERHEAD + SAFETY_BUFFER

  const contextLimit = MODEL_CONTEXT_LIMITS[selectedModel] || 200000

  // Auto-compaction via Haiku summarization
  let compactionOccurred = false
  let compactedTokensSaved = 0
  const shouldCompact = (estimatedInputTokens > contextLimit * 0.70 && trimmedMessages.length > 6)
    || trimmedMessages.length > 30
  if (shouldCompact) {
    const preCompactionTokens = estimatedInputTokens
    const result = await compactMessages(trimmedMessages, projectId, estimatedInputTokens, contextLimit)
    trimmedMessages = result.messages
    compactionOccurred = result.compacted
    if (compactionOccurred) {
      messageTokens = JSON.stringify(trimmedMessages).length / 3
      estimatedInputTokens = messageTokens + systemTokens + TOOL_SCHEMA_OVERHEAD + SAFETY_BUFFER
      compactedTokensSaved = Math.round(preCompactionTokens - estimatedInputTokens)
      console.log(`[pi] rid=${requestId} Compaction saved ~${compactedTokensSaved} tokens (${Math.round(preCompactionTokens)} → ${Math.round(estimatedInputTokens)})`)
    }
  }

  // Track whether this request's stream count has been decremented
  let streamCounted = true

  const DESIRED_MAX_TOKENS = MODEL_MAX_OUTPUT[selectedModel] || 64000
  const MIN_OUTPUT_TOKENS = 4000
  let availableForOutput = contextLimit - estimatedInputTokens
  let dynamicMaxTokens = Math.min(DESIRED_MAX_TOKENS, Math.max(MIN_OUTPUT_TOKENS, availableForOutput))

  // If even MIN_OUTPUT_TOKENS won't fit, reject early
  if (availableForOutput < MIN_OUTPUT_TOKENS) {
    if (streamCounted) {
      streamCounted = false
      const se = activeStreams.get(ip)
      if (!se || se.count <= 1) activeStreams.delete(ip)
      else activeStreams.set(ip, { count: se.count - 1, ts: Date.now() })
    }

    console.warn(`[pi] rid=${requestId} Context overflow: est_input=${Math.round(estimatedInputTokens)} available=${availableForOutput} limit=${contextLimit}`)
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

  // Convert UIMessages to ModelMessages (v6 — async)
  let messages
  try {
    messages = await convertToModelMessages(trimmedMessages)
  } catch (err) {
    console.error('[chat] convertToModelMessages failed, using fallback:', err instanceof Error ? err.message : err)
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
        await supabaseFetch('/pi_chat_messages', {
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
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        // Send model suggestion as transient data part
        if (modelAutoRouted) {
          const classification = classifyModelComplexity(body.messages || [], Object.keys(safeFiles).length)
          writer.write({
            type: 'data-pi-meta',
            data: JSON.stringify({ type: 'model_suggestion', model: selectedModel, reason: classification.reason }),
          } as any)
        }

        // Send context usage warning if approaching limit
        if (contextWarning) {
          writer.write({
            type: 'data-pi-meta',
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
            type: 'data-pi-meta',
            data: JSON.stringify({
              type: 'compaction_notice',
              tokensSaved: compactedTokensSaved,
            }),
          } as any)
        }

        const result = streamText({
          model: aiProvider(selectedModel),
          system: systemPromptStr,
          messages,
          maxOutputTokens: dynamicMaxTokens,
          stopWhen: stepCountIs(MODEL_MAX_STEPS[selectedModel] || 70),
          abortSignal: streamAbort.signal,
          tools: allTools,
          ...(!['claude-opus-4-6', 'claude-sonnet-4-20250514'].includes(selectedModel) ? {
            toolChoice: 'required' as const,
            prepareStep: ({ stepNumber }: { stepNumber: number }) => ({
              toolChoice: stepNumber < 2 ? ('required' as const) : ('auto' as const),
            }),
          } : {}),
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

            if (streamCounted) {
              streamCounted = false
              const se = activeStreams.get(ip)
              if (!se || se.count <= 1) activeStreams.delete(ip)
              else activeStreams.set(ip, { count: se.count - 1, ts: Date.now() })
            }

            console.log(`[pi] rid=${requestId} ${event.totalUsage?.totalTokens || 0} tokens, ${event.steps?.length || 0} steps`)

            // Server-side usage tracking per user
            if (event.totalUsage && session?.user) {
              const userId = (session as any).githubUsername || 'unknown'
              const prev = usageTracker.get(userId) || { tokens: 0, requests: 0, ts: Date.now() }
              prev.tokens += event.totalUsage.totalTokens || 0
              prev.requests += 1
              prev.ts = Date.now()
              usageTracker.set(userId, prev)
              if (usageTracker.size > MAX_USAGE_ENTRIES) {
                const sorted = [...usageTracker.entries()].sort((a, b) => a[1].ts - b[1].ts)
                while (usageTracker.size > MAX_USAGE_ENTRIES) {
                  usageTracker.delete(sorted.shift()![0])
                }
              }
              console.log(`[pi:usage] user=${userId} req_tokens=${event.totalUsage.totalTokens} cumulative=${prev.tokens} requests=${prev.requests}`)
            }

            // Save assistant message to database
            if (projectId && event.text) {
              try {
                await supabaseFetch('/pi_chat_messages', {
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

        writer.merge(result.toUIMessageStream({
          sendReasoning: true,
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

    return createUIMessageStreamResponse({
      stream,
      headers: {
        'X-RateLimit-Remaining': String(limit.remaining),
        'X-RateLimit-Reset': String(Math.ceil(limit.resetIn / 1000)),
      },
    })
  } catch (error) {
    clearTimeout(streamTimeout)

    if (streamCounted) {
      streamCounted = false
      const se = activeStreams.get(ip)
      if (!se || se.count <= 1) activeStreams.delete(ip)
      else activeStreams.set(ip, { count: se.count - 1, ts: Date.now() })
    }

    const err = error instanceof Error ? error : new Error(String(error))
    const msg = err.message || ''
    logger.error('Stream failed', {
      requestId,
      error: msg,
      stack: err.stack,
      model: selectedModel,
      ip,
    })

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
