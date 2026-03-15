'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { UIMessage } from 'ai'
import { toast } from 'sonner'

const PAGE_SIZE = 50

export function useChatHistory(
  projectId: string | null,
  setMessages: (messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => void,
) {
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const historyLoadingRef = useRef(false)
  const oldestCursorRef = useRef<string | null>(null)

  // Initial load — fetches the most recent PAGE_SIZE messages
  useEffect(() => {
    if (!projectId || historyLoaded) return
    if (historyLoadingRef.current) return
    historyLoadingRef.current = true
    setHistoryLoaded(true)
    setLoadingHistory(true)

    const loadWithRetry = async (attempt = 0) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/messages?limit=${PAGE_SIZE}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (data.messages?.length > 0) {
          const loaded = data.messages.map((msg: any) => ({
            id: msg.id,
            role: msg.role,
            parts: [{ type: 'text', text: msg.content || '' }],
            content: msg.content || '',
          }))
          setMessages(loaded)
          // Track cursor for pagination — oldest message is the first in the ascending list
          // The API returns messages ordered by created_at ASC, so if we got a full page
          // there may be newer messages beyond this set. However, since messages are ascending,
          // "older" messages would require a different query approach.
          // The API uses cursor-based forward pagination (gt cursor), so for "load older"
          // we need to store the earliest created_at and query with lt.
          setHasOlderMessages(data.nextCursor !== null)
          if (data.messages.length > 0) {
            oldestCursorRef.current = data.messages[0].created_at
          }
        }
      } catch (err) {
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
          return loadWithRetry(attempt + 1)
        }
        console.warn('Failed to load chat history after retries:', err)
        toast.error('Could not load chat history', { description: 'Previous messages may be missing.', duration: 4000 })
      } finally {
        setLoadingHistory(false)
        historyLoadingRef.current = false
      }
    }
    loadWithRetry()
  }, [projectId, historyLoaded, setMessages])

  // Load older messages — prepends to the messages array
  const loadOlderMessages = useCallback(async () => {
    if (!projectId || loadingOlder || !hasOlderMessages) return

    setLoadingOlder(true)
    try {
      // Fetch messages older than our oldest cursor
      // The API uses `gt` for cursor, but we need `lt` for older messages.
      // We'll use a different approach: fetch without cursor but with a limit,
      // ordering ascending, and filtering to before the oldest message.
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
      })
      if (oldestCursorRef.current) {
        params.set('before', oldestCursorRef.current)
      }
      const res = await fetch(`/api/projects/${projectId}/messages?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      if (data.messages?.length > 0) {
        const olderMsgs: UIMessage[] = data.messages.map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          parts: [{ type: 'text', text: msg.content || '' }],
          content: msg.content || '',
        }))

        // Prepend older messages
        setMessages((prev: UIMessage[]) => [...olderMsgs, ...prev])

        // Update oldest cursor
        oldestCursorRef.current = data.messages[0].created_at

        // If we got fewer than PAGE_SIZE, no more older messages
        if (data.messages.length < PAGE_SIZE) {
          setHasOlderMessages(false)
        }
      } else {
        setHasOlderMessages(false)
      }
    } catch (err) {
      console.warn('Failed to load older messages:', err)
      toast.error('Failed to load older messages', { duration: 3000 })
    } finally {
      setLoadingOlder(false)
    }
  }, [projectId, loadingOlder, hasOlderMessages, setMessages])

  return { loadingHistory, historyLoaded, loadOlderMessages, loadingOlder, hasOlderMessages }
}
