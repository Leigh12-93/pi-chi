import { generateText, UIMessage } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

// ═══════════════════════════════════════════════════════════════════
// Auto-compaction: Summarize older messages to reclaim context space
// Inspired by Claude Code's context compaction system
// ═══════════════════════════════════════════════════════════════════

// Compaction model — fast + cheap for summarization
const COMPACTION_MODEL = (process.env.COMPACTION_MODEL || 'claude-haiku-35-20241022').trim()

// Constants
const COMPACTION_THRESHOLD = 0.50        // Trigger at 50% of context limit — compact early to avoid 413 errors
const PRESERVE_FIRST = 2                 // Keep first 2 messages (initial context)
const PRESERVE_RECENT = 8               // Keep last 8 messages (current work)
const MAX_SUMMARY_INPUT_CHARS = 50000   // Cap Haiku input at ~12.5K tokens
const MAX_SUMMARY_TOKENS = 2000         // Concise summary output
const COMPACTION_TIMEOUT_MS = 10000     // 10s timeout for Haiku call
const CACHE_TTL_MS = 5 * 60 * 1000     // 5 min cache
const CACHE_MAX_ENTRIES = 100

// Module-level cache — persists across requests per conversation
const compactionCache = new Map<string, {
  messages: UIMessage[]
  ts: number
}>()

function cleanupCache() {
  const now = Date.now()
  for (const [k, v] of compactionCache) {
    if (now - v.ts > CACHE_TTL_MS) compactionCache.delete(k)
  }
  if (compactionCache.size > CACHE_MAX_ENTRIES) {
    const entries = [...compactionCache.entries()].sort((a, b) => a[1].ts - b[1].ts)
    while (compactionCache.size > CACHE_MAX_ENTRIES) {
      compactionCache.delete(entries.shift()![0])
    }
  }
}

/** Extract text content from a UIMessage (v6 parts or legacy content) */
function getMessageText(msg: UIMessage): string {
  const m = msg as any
  if (Array.isArray(m.parts)) {
    return m.parts
      .filter((p: any) => p.type === 'text')
      .map((p: any) => p.text || '')
      .join('')
  }
  if (typeof m.content === 'string') return m.content
  return ''
}

/**
 * Check if compaction should trigger and compact if needed.
 * Returns the (possibly compacted) messages array.
 */
export async function compactMessages(
  messages: UIMessage[],
  projectId: string | null,
  estimatedInputTokens: number,
  contextLimit: number,
): Promise<{ messages: UIMessage[]; compacted: boolean; tokensSaved: number }> {
  // Only trigger at threshold
  if (estimatedInputTokens <= contextLimit * COMPACTION_THRESHOLD) {
    return { messages, compacted: false, tokensSaved: 0 }
  }

  // Need enough messages to make compaction worthwhile
  if (messages.length <= PRESERVE_FIRST + PRESERVE_RECENT + 2) {
    return { messages, compacted: false, tokensSaved: 0 }
  }

  // Check cache
  cleanupCache()
  const lastMsg = messages[messages.length - 1]
  const cacheKey = `${projectId || '_anon'}:${messages.length}:${lastMsg?.id || ''}`
  const cached = compactionCache.get(cacheKey)
  if (cached) {
    const savedTokens = Math.round(
      (JSON.stringify(messages).length - JSON.stringify(cached.messages).length) / 4
    )
    return { messages: cached.messages, compacted: true, tokensSaved: savedTokens }
  }

  // Split: first (preserved) + middle (to summarize) + recent (preserved)
  const firstMessages = messages.slice(0, PRESERVE_FIRST)
  const recentMessages = messages.slice(-PRESERVE_RECENT)
  const middleMessages = messages.slice(PRESERVE_FIRST, messages.length - PRESERVE_RECENT)

  if (middleMessages.length < 3) {
    return { messages, compacted: false, tokensSaved: 0 }
  }

  // Build text for summarization
  const middleText = middleMessages.map(m => {
    const role = m.role.toUpperCase()
    let text = getMessageText(m)
    if (text.length > 2000) text = text.slice(0, 2000) + '... [truncated]'
    return `[${role}]: ${text}`
  }).join('\n\n')

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('compaction: ANTHROPIC_API_KEY not set, using metadata-only fallback')
      throw new Error('ANTHROPIC_API_KEY not set')
    }

    const summary = await generateCompactionSummary(middleText)

    // Create synthetic assistant message with the summary
    const summaryText = `[Conversation Summary — ${middleMessages.length} messages compacted]\n${summary}`
    const summaryMessage = {
      id: `compaction-${Date.now()}`,
      role: 'assistant' as const,
      content: '',
      parts: [{ type: 'text' as const, text: summaryText }],
    } as UIMessage

    const compacted = [...firstMessages, summaryMessage, ...recentMessages]
    const savedTokens = Math.round(
      (JSON.stringify(messages).length - JSON.stringify(compacted).length) / 4
    )

    // Cache the result
    compactionCache.set(cacheKey, { messages: compacted, ts: Date.now() })

    console.log(`[forge:compaction] Compacted ${middleMessages.length} messages, saved ~${savedTokens} tokens`)
    return { messages: compacted, compacted: true, tokensSaved: savedTokens }
  } catch (error) {
    console.error('[forge:compaction] Haiku summarization failed, falling back to metadata-only summary:', error)

    // Fallback: extract metadata from dropped messages instead of losing them entirely
    const toolsUsed = new Set<string>()
    const filesReferenced = new Set<string>()
    for (const m of middleMessages) {
      const text = getMessageText(m)
      const toolMatch = text.match(/\[Tools used: ([^\]]+)\]/g)
      if (toolMatch) {
        for (const match of toolMatch) {
          const tools = match.replace(/\[Tools used: |\]/g, '').split(', ')
          tools.forEach(t => toolsUsed.add(t.split('(')[0].trim()))
        }
      }
      const pathMatches = text.match(/[\w\-./]+\.\w{1,10}/g)
      if (pathMatches) {
        pathMatches.slice(0, 50).forEach(p => filesReferenced.add(p))
      }
    }

    const fallbackSummary = [
      `[Conversation Summary — ${middleMessages.length} messages compacted (summarization unavailable, metadata only)]`,
      toolsUsed.size > 0 ? `Tools used: ${[...toolsUsed].join(', ')}` : '',
      filesReferenced.size > 0 ? `Files referenced: ${[...filesReferenced].slice(0, 30).join(', ')}` : '',
      `${middleMessages.filter(m => m.role === 'user').length} user messages and ${middleMessages.filter(m => m.role === 'assistant').length} assistant messages were compacted.`,
    ].filter(Boolean).join('\n')

    const summaryMessage = {
      id: `compaction-fallback-${Date.now()}`,
      role: 'assistant' as const,
      content: '',
      parts: [{ type: 'text' as const, text: fallbackSummary }],
    } as UIMessage

    const fallback = [...firstMessages, summaryMessage, ...recentMessages]
    const savedTokens = Math.round(
      (JSON.stringify(messages).length - JSON.stringify(fallback).length) / 4
    )
    return { messages: fallback, compacted: true, tokensSaved: savedTokens }
  }
}

/** Call Haiku to generate a concise conversation summary */
async function generateCompactionSummary(conversationText: string): Promise<string> {
  const truncated = conversationText.length > MAX_SUMMARY_INPUT_CHARS
    ? conversationText.slice(0, MAX_SUMMARY_INPUT_CHARS) + '\n\n[...older messages truncated...]'
    : conversationText

  const { text } = await generateText({
    model: anthropic(COMPACTION_MODEL),
    maxOutputTokens: MAX_SUMMARY_TOKENS,
    abortSignal: AbortSignal.timeout(COMPACTION_TIMEOUT_MS),
    system: `You are a conversation summarizer for Forge, an AI code builder. Create a concise summary that captures everything the AI needs to continue working.

Include:
1. **Files created/modified**: List all file paths and their purpose
2. **Key decisions**: Architecture choices, libraries, patterns chosen
3. **Current state**: What's working, what's broken, what the user wants next
4. **Requirements**: User preferences, constraints, specifications mentioned

Format as structured bullet points. Be specific about file paths and code patterns.
Keep under 1500 tokens. No pleasantries or meta-commentary.`,
    prompt: `Summarize this Forge coding session:\n\n${truncated}`,
  })

  return text
}
