'use client'

import { useRef, useEffect } from 'react'
import {
  Wrench, CheckCircle2, XCircle, Loader2,
  Terminal, FileCode, GitBranch, Hammer, Globe, Server, Brain, MessageCircle, Cpu, Code,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { ToolExecutionEvent, ToolCategory } from '@/lib/brain/domain-types'

/* ─── Props ────────────────────────────────────── */

interface ToolEventFeedProps {
  events: ToolExecutionEvent[]
  className?: string
  maxVisible?: number
}

/* ─── Duration formatter ───────────────────────── */

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

/* ─── Tool name formatter ──────────────────────── */

function formatToolName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

/* ─── Status icon ──────────────────────────────── */

function StatusIcon({ status }: { status: ToolExecutionEvent['status'] }) {
  if (status === 'running') {
    return (
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
      >
        <Loader2 className="w-3 h-3 text-pi-accent" />
      </motion.div>
    )
  }
  if (status === 'completed') {
    return <CheckCircle2 className="w-3 h-3 text-pi-success" />
  }
  return <XCircle className="w-3 h-3 text-pi-danger" />
}

/* ─── Category icon ───────────────────────────── */

const categoryIcons: Record<ToolCategory, React.ElementType> = {
  shell: Terminal,
  file: FileCode,
  git: GitBranch,
  build: Hammer,
  network: Globe,
  system: Server,
  brain: Brain,
  comms: MessageCircle,
  gpio: Cpu,
  coding: Code,
  other: Wrench,
}

/* ─── Single event row ─────────────────────────── */

function EventRow({ event }: { event: ToolExecutionEvent }) {
  const isRunning = event.status === 'running'
  const isFailed = event.status === 'failed'
  const CategoryIcon = categoryIcons[event.category] || Wrench

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={cn(
        'flex items-start gap-2 px-3 py-2 border-b border-pi-border/40 last:border-0',
        'transition-colors duration-300',
        isRunning && 'bg-pi-accent/5 animate-pulse-subtle',
        isFailed && 'bg-pi-danger/5',
      )}
    >
      {/* Status icon */}
      <div className="shrink-0 mt-0.5">
        <StatusIcon status={event.status} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <CategoryIcon className="w-2.5 h-2.5 text-pi-text-dim shrink-0" />
          <span className={cn(
            'text-[11px] font-medium truncate',
            isRunning ? 'text-pi-accent' : isFailed ? 'text-pi-danger' : 'text-pi-text'
          )}>
            {formatToolName(event.toolName)}
          </span>

          {/* Duration badge */}
          {event.durationMs !== undefined && (
            <span className={cn(
              'ml-auto shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded border',
              isFailed
                ? 'text-pi-danger border-pi-danger/30 bg-pi-danger/10'
                : 'text-pi-text-dim border-pi-border/50 bg-pi-surface/50'
            )}>
              {formatDuration(event.durationMs)}
            </span>
          )}

          {/* Running indicator */}
          {isRunning && (
            <span className="ml-auto shrink-0 text-[9px] text-pi-accent/70 font-medium animate-pulse">
              running
            </span>
          )}
        </div>

        {/* Input summary — shows what the tool is operating on */}
        {event.inputSummary && (
          <p className="mt-0.5 text-[10px] text-pi-text-dim/70 font-mono truncate leading-tight">
            {event.inputSummary}
          </p>
        )}

        {/* Result / error */}
        {event.resultSummary && (
          <p className="mt-0.5 text-[10px] text-pi-text-dim truncate leading-tight">
            {event.resultSummary}
          </p>
        )}
        {event.error && (
          <p className="mt-0.5 text-[10px] text-pi-danger/80 truncate leading-tight">
            {event.error}
          </p>
        )}
      </div>
    </motion.div>
  )
}

/* ─── ToolEventFeed ────────────────────────────── */

export function ToolEventFeed({ events, className, maxVisible = 10 }: ToolEventFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll to top when new events arrive (newest first)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [events.length])

  // Newest first, capped at maxVisible
  const visible = [...events].reverse().slice(0, maxVisible)

  if (visible.length === 0) {
    return (
      <div className={cn('flex items-center justify-center py-4', className)}>
        <span className="text-[10px] text-pi-text-dim">No tool activity this cycle</span>
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      className={cn(
        'overflow-y-auto',
        'max-h-48 scrollbar-thin',
        className,
      )}
    >
      <AnimatePresence initial={false}>
        {visible.map(event => (
          <EventRow key={event.id} event={event} />
        ))}
      </AnimatePresence>
    </div>
  )
}
