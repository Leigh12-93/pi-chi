// Message processing — trimming, tool result stripping, dedup two-pass logic, sanitization

import type { UIMessage } from 'ai'
import { MAX_HISTORY, FULL_DETAIL_WINDOW } from './rate-limiter'

/** Trim conversation history to MAX_HISTORY messages, keeping first 2 + last (MAX_HISTORY - 2) */
export function trimMessages(messages: UIMessage[]): UIMessage[] {
  if (messages.length > MAX_HISTORY) {
    return [...messages.slice(0, 2), ...messages.slice(-(MAX_HISTORY - 2))]
  }
  return messages
}

/**
 * Strip tool parts from older messages to save tokens AND prevent duplicate
 * tool_use IDs (which Anthropic API rejects). Only the last FULL_DETAIL_WINDOW
 * messages keep full tool invocation details.
 */
export function stripOlderToolParts(messages: UIMessage[]): UIMessage[] {
  return messages.map((m: any, i: number) => {
    const fromEnd = messages.length - i

    // Last FULL_DETAIL_WINDOW messages — full detail (tool parts intact)
    if (fromEnd <= FULL_DETAIL_WINDOW) return m

    // ALL older messages — strip tool parts entirely, convert to text summaries.
    if (m.role === 'assistant' && Array.isArray(m.parts)) {
      const toolParts = m.parts.filter((p: any) => p.type === 'tool-invocation' || p.type?.startsWith('tool-'))
      const textParts = m.parts.filter((p: any) => p.type === 'text')
      if (toolParts.length > 0) {
        const summary = toolParts.map((p: any) => {
          const name = (p.toolName || p.type?.replace('tool-', '') || 'unknown').slice(0, 50)
          const path = (p.input?.path || p.args?.path || '').slice(0, 100)
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

    // Legacy v4 format
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
}

/**
 * Dedup tool_use IDs — Anthropic API rejects duplicate IDs across the conversation.
 * Two-pass: collect seen IDs (reverse), then strip duplicates + orphaned tool_results (forward).
 */
export function dedupToolIds(messages: UIMessage[]): UIMessage[] {
  const seenToolIds = new Set<string>()
  // First pass: collect all tool_use IDs from the last messages (highest priority to keep)
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as any
    if (m.role === 'assistant' && Array.isArray(m.parts)) {
      for (const p of m.parts) {
        if ((p.type === 'tool-invocation' || p.type === 'tool-call') && p.toolCallId) {
          seenToolIds.add(p.toolCallId)
        }
      }
    }
  }

  // Second pass: strip duplicate tool_use parts and orphaned tool_results (forward scan)
  const keepToolIds = new Set<string>()
  return messages.map((m: any) => {
    if (m.role === 'assistant' && Array.isArray(m.parts)) {
      const filtered = m.parts.filter((p: any) => {
        if ((p.type === 'tool-invocation' || p.type === 'tool-call') && p.toolCallId) {
          if (keepToolIds.has(p.toolCallId)) {
            return false
          }
          keepToolIds.add(p.toolCallId)
        }
        return true
      })
      if (filtered.length !== m.parts.length) {
        return { ...m, parts: filtered.length > 0 ? filtered : [{ type: 'text', text: '[tool calls deduplicated]' }] }
      }
    }
    if (m.role === 'user' && Array.isArray(m.parts)) {
      const filtered = m.parts.filter((p: any) => {
        if (p.type === 'tool-result' && p.toolCallId && !keepToolIds.has(p.toolCallId)) {
          return false
        }
        return true
      })
      if (filtered.length !== m.parts.length) {
        if (filtered.length === 0) return { ...m, parts: [{ type: 'text', text: '[continued]' }] }
        return { ...m, parts: filtered }
      }
    }
    return m
  })
}

/**
 * Sanitize tool part inputs — Anthropic API requires tool_use.input to be a valid dict.
 * Client-sent UIMessages may have input: undefined, null, or string.
 */
export function sanitizeToolInputs(messages: UIMessage[]): UIMessage[] {
  return messages.map((m: any) => {
    if (m.role !== 'assistant' || !Array.isArray(m.parts)) return m
    let modified = false
    const sanitizedParts = m.parts.map((p: any) => {
      const isToolPart = p.type?.startsWith('tool-') || p.type === 'dynamic-tool'
      if (!isToolPart) return p
      const input = p.input
      if (input !== null && input !== undefined && typeof input === 'object' && !Array.isArray(input)) {
        return p // Already a valid dict
      }
      modified = true
      return { ...p, input: input != null ? { _raw: String(input) } : {} }
    })
    return modified ? { ...m, parts: sanitizedParts } : m
  })
}

/** Full message processing pipeline: trim -> strip tool parts -> dedup -> sanitize */
export function processMessages(rawMessages: UIMessage[]): UIMessage[] {
  let messages = trimMessages(rawMessages)
  messages = stripOlderToolParts(messages)
  messages = dedupToolIds(messages)
  messages = sanitizeToolInputs(messages)
  return messages
}
