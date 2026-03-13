'use client'

import { useRef, useEffect } from 'react'
import type { UIMessage } from 'ai'
import { toast } from 'sonner'

/** Custom data parts injected by the server aren't in UIMessage's standard part types */
interface PiMetaPart { type: string; data?: string }

export function useContextWarnings(messages: UIMessage[]) {
  const contextWarningShownRef = useRef<string | null>(null)
  const compactionShownRef = useRef<string | null>(null)
  const compactionToastCooldownRef = useRef<number>(0)

  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== 'assistant' || !msg.parts) continue
      for (const p of msg.parts as PiMetaPart[]) {
        if (p.type !== 'data-pi-meta' || typeof p.data !== 'string') continue
        try {
          const parsed = JSON.parse(p.data)
          if (parsed.type === 'context_warning' && contextWarningShownRef.current !== msg.id) {
            contextWarningShownRef.current = msg.id
            if (parsed.level === 'critical') {
              toast.error('Context limit nearly reached', {
                description: `~${parsed.estimatedUsage}% of context used. Start a new chat to avoid failures.`,
                duration: 8000,
              })
            } else {
              toast.warning('Context getting long', {
                description: `~${parsed.estimatedUsage}% of context used. Consider starting a new chat soon.`,
                duration: 6000,
              })
            }
          }
          if (parsed.type === 'compaction_notice' && compactionShownRef.current !== msg.id) {
            compactionShownRef.current = msg.id
            const now = Date.now()
            if (now - compactionToastCooldownRef.current > 120_000) {
              compactionToastCooldownRef.current = now
              toast.info('Context compacted', {
                description: 'Older messages summarized to free up context space.',
                duration: 5000,
              })
            }
          }
        } catch { /* not JSON data part — ignore */ }
      }
    }
  }, [messages])
}
