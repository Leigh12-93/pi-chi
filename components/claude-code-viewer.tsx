'use client'

import { useState, useEffect, useRef } from 'react'
import { Terminal, ChevronDown, ChevronUp, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClaudeCodeViewerProps {
  className?: string
}

interface LiveLogResponse {
  active: boolean
  content: string
  size: number
}

export function ClaudeCodeViewer({ className }: ClaudeCodeViewerProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [logData, setLogData] = useState<LiveLogResponse | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let interval: NodeJS.Timeout

    const pollLiveLog = async () => {
      try {
        const response = await fetch('/api/brain/live-log')
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        const data: LiveLogResponse = await response.json()
        setLogData(data)
        setError(null)

        // Auto-expand when Claude Code becomes active
        if (data.active && !isExpanded) {
          setIsExpanded(true)
        }

        // Scroll to bottom when content updates
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch log')
      }
    }

    if (isPolling) {
      pollLiveLog() // Initial fetch
      interval = setInterval(pollLiveLog, 2000)
    }

    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [isPolling, isExpanded])

  useEffect(() => {
    // Start polling when component mounts
    setIsPolling(true)
    return () => setIsPolling(false)
  }, [])

  const hasContent = logData && logData.content.trim().length > 0

  return (
    <div className={cn("border rounded-lg bg-card", className)}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4" />
          <span className="font-medium">Claude Code Output</span>
          {logData?.active && (
            <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <Activity className="h-3 w-3 animate-pulse" />
              <span>Active</span>
            </div>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t">
          {error ? (
            <div className="p-4 text-red-600 dark:text-red-400 text-sm">
              Error: {error}
            </div>
          ) : !hasContent ? (
            <div className="p-4 text-muted-foreground text-sm">
              No Claude Code output yet. Output will appear here when Claude Code is running.
            </div>
          ) : (
            <div
              ref={scrollRef}
              className="p-4 bg-black text-green-400 font-mono text-xs max-h-64 overflow-y-auto"
              style={{
                fontFamily: 'Consolas, "Courier New", monospace',
                lineHeight: '1.4'
              }}
            >
              <pre className="whitespace-pre-wrap">{logData?.content}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}