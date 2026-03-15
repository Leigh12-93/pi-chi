'use client'

import { useState, useRef, useCallback } from 'react'

/* ─── Vercel AI SDK Data Stream Protocol Parser ────────────── */
/*
 * Protocol line prefixes (from ai SDK v6):
 *   0: text delta
 *   9: tool call streaming start
 *   a: tool result
 *   e: finish (message complete)
 *   d: finish step
 *   3: error
 *   2: data (JSON array)
 */

export interface ToolCallEvent {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  occurredAt: string
}

export interface ToolResultEvent {
  toolCallId: string
  toolName: string
  result: string
  occurredAt: string
}

interface UseBrainStreamReturn {
  send: (message: string, clientMessageId?: string) => Promise<void>
  streamingText: string
  isStreaming: boolean
  activeToolCall: ToolCallEvent | null
  toolResults: ToolResultEvent[]
  error: string | null
  canRetry: boolean
  retry: () => void
}

export function useBrainStream(): UseBrainStreamReturn {
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [activeToolCall, setActiveToolCall] = useState<ToolCallEvent | null>(null)
  const [toolResults, setToolResults] = useState<ToolResultEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [canRetry, setCanRetry] = useState(false)

  const lastMessageRef = useRef<string>('')
  const lastClientMessageIdRef = useRef<string | undefined>(undefined)
  const textAccRef = useRef('')
  const rafIdRef = useRef<number | null>(null)
  const pendingTextRef = useRef<string | null>(null)
  const hadResponseActivityRef = useRef(false)

  // Batch text updates via requestAnimationFrame
  const scheduleTextUpdate = useCallback((text: string) => {
    pendingTextRef.current = text
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        if (pendingTextRef.current !== null) {
          setStreamingText(pendingTextRef.current)
        }
        rafIdRef.current = null
      })
    }
  }, [])

  const processLine = useCallback((line: string) => {
    if (!line || line.length < 2) return

    const prefix = line[0]
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) return

    const payload = line.slice(colonIdx + 1)

    switch (prefix) {
      case '0': {
        // Text delta — payload is a JSON string
        try {
          const text = JSON.parse(payload) as string
          textAccRef.current += text
          hadResponseActivityRef.current = true
          scheduleTextUpdate(textAccRef.current)
        } catch { /* non-JSON text chunk, append raw */ }
        break
      }
      case '9': {
        // Tool call start
        try {
          const data = JSON.parse(payload) as { toolCallId: string; toolName: string; args?: Record<string, unknown> }
          hadResponseActivityRef.current = true
          setActiveToolCall({
            toolCallId: data.toolCallId,
            toolName: data.toolName,
            args: data.args || {},
            occurredAt: new Date().toISOString(),
          })
        } catch { /* ignore parse errors */ }
        break
      }
      case 'a': {
        // Tool result
        try {
          const data = JSON.parse(payload) as { toolCallId: string; toolName: string; result: unknown }
          hadResponseActivityRef.current = true
          setToolResults(prev => [...prev, {
            toolCallId: data.toolCallId,
            toolName: data.toolName,
            result: typeof data.result === 'string' ? data.result : JSON.stringify(data.result),
            occurredAt: new Date().toISOString(),
          }])
          setActiveToolCall(null)
        } catch { /* ignore */ }
        break
      }
      case '3': {
        // Error
        try {
          const errMsg = JSON.parse(payload) as string
          setError(errMsg)
        } catch {
          setError(payload)
        }
        break
      }
      case 'e':
      case 'd': {
        // Finish / finish step — handled by stream end
        break
      }
      // 2: data messages — ignore for now
    }
  }, [scheduleTextUpdate])

  const send = useCallback(async (message: string, clientMessageId?: string) => {
    lastMessageRef.current = message
    lastClientMessageIdRef.current = clientMessageId
    textAccRef.current = ''
    hadResponseActivityRef.current = false
    setStreamingText('')
    setIsStreaming(true)
    setActiveToolCall(null)
    setToolResults([])
    setError(null)
    setCanRetry(false)

    try {
      const res = await fetch('/api/brain/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, clientMessageId }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        if (res.status === 409) {
          setError(err.error || 'Message already received. Waiting for sync.')
        } else {
          setError(err.error || `HTTP ${res.status}`)
          setCanRetry(!hadResponseActivityRef.current)
        }
        setIsStreaming(false)
        return
      }

      const reader = res.body?.getReader()
      if (!reader) {
        setError('No response stream')
        setIsStreaming(false)
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process complete lines
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete last line in buffer

        for (const line of lines) {
          processLine(line.trim())
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        processLine(buffer.trim())
      }

      // Final text update
      if (textAccRef.current) {
        setStreamingText(textAccRef.current)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
      setCanRetry(!hadResponseActivityRef.current)
    } finally {
      setIsStreaming(false)
      setActiveToolCall(null)
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
  }, [processLine])

  const retry = useCallback(() => {
    if (lastMessageRef.current) {
      send(lastMessageRef.current, lastClientMessageIdRef.current)
    }
  }, [send])

  return {
    send,
    streamingText,
    isStreaming,
    activeToolCall,
    toolResults,
    error,
    canRetry,
    retry,
  }
}
