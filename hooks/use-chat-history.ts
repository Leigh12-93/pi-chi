'use client'

import { useState, useRef, useEffect } from 'react'
import type { UIMessage } from 'ai'
import { toast } from 'sonner'

export function useChatHistory(
  projectId: string | null,
  setMessages: (messages: UIMessage[]) => void,
) {
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const historyLoadingRef = useRef(false)

  useEffect(() => {
    if (!projectId || historyLoaded) return
    if (historyLoadingRef.current) return
    historyLoadingRef.current = true
    setHistoryLoaded(true)
    setLoadingHistory(true)

    const loadWithRetry = async (attempt = 0) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/messages`)
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

  return { loadingHistory, historyLoaded }
}
