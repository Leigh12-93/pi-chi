'use client'

import { memo, useDeferredValue, useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  Send, MessageCircle, Bot, Check, CheckCheck,
  Sparkles, Wifi, WifiOff, ArrowDown, Wrench, Search, X,
  AlertCircle, RotateCcw, ChevronDown, Activity, HeartPulse, Terminal, Target,
} from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { cachedRenderMarkdown } from '@/lib/chat/markdown'
import { useBrainStream } from '@/hooks/use-brain-stream'
import type { BrainChatMessage } from '@/hooks/use-agent-state'

/* ─── Props ─────────────────────────────────────── */

interface BrainChatProps {
  chatMessages: BrainChatMessage[]
  brainStatus: 'running' | 'sleeping' | 'not-running' | 'error'
  brainName?: string
  onSendMessage?: (message: string) => Promise<boolean>
  onMarkRead: () => Promise<boolean>
  className?: string
}

/* ─── Time helpers ──────────────────────────────── */

function formatTime(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch { return '' }
}

function formatDate(timestamp: string): string {
  try {
    const d = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 86400000) return 'Today'
    if (diff < 172800000) return 'Yesterday'
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  } catch { return '' }
}

/* ─── Highlight matching text ─────────────────── */

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="bg-yellow-400/30 text-inherit rounded-sm px-0.5">{part}</mark>
          : part
      )}
    </>
  )
}

/* ─── Typing indicator ─────────────────────────── */

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -5, scale: 0.95 }}
      className="flex justify-start mb-2"
    >
      <div className="bg-pi-surface border border-pi-border rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
        <Bot className="w-3.5 h-3.5 text-pi-accent mr-1" />
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </motion.div>
  )
}

/* ─── Single message bubble ────────────────────── */

const messageVariants = {
  initial: (isOwner: boolean) => ({
    opacity: 0,
    y: 12,
    x: isOwner ? 20 : -20,
    scale: 0.92,
  }),
  animate: {
    opacity: 1,
    y: 0,
    x: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 500, damping: 30 },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.15 },
  },
}

const MessageBubble = memo(function MessageBubble({ msg, name, isStreaming, searchQuery }: {
  msg: BrainChatMessage; name: string; isStreaming?: boolean; searchQuery?: string
}) {
  const isOwner = msg.from === 'owner'
  const prefersReducedMotion = useReducedMotion()

  // Render brain messages with markdown
  const renderedHtml = useMemo(() => {
    if (isOwner || isStreaming) return null
    return cachedRenderMarkdown(msg.message)
  }, [isOwner, isStreaming, msg.message])

  return (
    <motion.div
      layout
      custom={isOwner}
      variants={prefersReducedMotion ? undefined : messageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={cn('flex mb-2.5', isOwner ? 'justify-end' : 'justify-start')}
    >
      {/* Avatar for brain */}
      {!isOwner && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 600, damping: 20, delay: 0.1 }}
          className={cn(
            'w-7 h-7 rounded-full flex items-center justify-center mr-2 mt-1 shrink-0',
            'bg-gradient-to-br from-pi-accent/20 to-purple-500/20 border border-pi-accent/30',
            isStreaming && 'shadow-[0_0_12px_rgba(0,212,255,0.3)] animate-pulse'
          )}
        >
          <Bot className="w-3.5 h-3.5 text-pi-accent" />
        </motion.div>
      )}

      <div className={cn('max-w-[80%] relative group', isOwner ? 'order-1' : 'order-2')}>
        <div className={cn(
          'rounded-2xl px-3.5 py-2.5 shadow-sm transition-shadow duration-300',
          isOwner
            ? 'bg-gradient-to-br from-pi-accent to-pi-accent-hover text-white rounded-br-md shadow-pi-accent/10 hover:shadow-pi-accent/20 hover:shadow-md'
            : 'bg-pi-surface border border-pi-border text-pi-text rounded-bl-md hover:border-pi-accent/20 hover:shadow-md',
          isStreaming && !isOwner && 'border-pi-accent/30'
        )}>
          {/* Sender label */}
          {!isOwner && (
            <span className="text-[9px] font-semibold text-pi-accent block mb-0.5">{name}</span>
          )}

          {/* Message body */}
          {isOwner ? (
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words text-white">
              {searchQuery ? <HighlightText text={msg.message} query={searchQuery} /> : msg.message}
            </p>
          ) : isStreaming ? (
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words text-pi-text">
              {msg.message}
              <motion.span
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.5, repeat: Infinity }}
                className="inline-block w-0.5 h-[14px] bg-pi-accent ml-0.5 align-text-bottom"
              />
            </p>
          ) : renderedHtml ? (
            <div
              className="prose-brain text-pi-text"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          ) : (
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words text-pi-text">
              {searchQuery ? <HighlightText text={msg.message} query={searchQuery} /> : msg.message}
            </p>
          )}

          {/* Timestamp + read receipt */}
          <div className={cn('flex items-center gap-1 mt-1', isOwner ? 'justify-end' : 'justify-start')}>
            <span className={cn('text-[9px]', isOwner ? 'text-white/50' : 'text-pi-text-dim/40')}>
              {isStreaming ? 'typing...' : formatTime(msg.timestamp)}
            </span>
            {isOwner && !isStreaming && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              >
                {msg.read
                  ? <CheckCheck className="w-3 h-3 text-white/80" />
                  : <Check className="w-3 h-3 text-white/40" />}
              </motion.span>
            )}
          </div>
        </div>
      </div>

      {/* Avatar for owner */}
      {isOwner && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 600, damping: 20, delay: 0.1 }}
          className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-emerald-500/30 flex items-center justify-center ml-2 mt-1 shrink-0"
        >
          <span className="text-[10px] font-bold text-emerald-500">L</span>
        </motion.div>
      )}
    </motion.div>
  )
})

/* ─── Tool call indicator with real names ────────── */

function ToolCallIndicator({ toolName, result }: { toolName: string; result?: string }) {
  const [expanded, setExpanded] = useState(false)
  const labels: Record<string, string> = {
    add_goal: 'Adding goal',
    complete_goal: 'Completing goal',
    remove_goal: 'Removing goal',
    list_goals: 'Checking goals',
    update_mood: 'Updating mood',
    run_command: 'Running command',
    set_wake_interval: 'Changing wake interval',
    get_system_info: 'Checking system',
  }
  const iconMap: Record<string, React.ElementType> = {
    add_goal: Target,
    complete_goal: Target,
    remove_goal: Target,
    list_goals: Target,
    update_mood: HeartPulse,
    run_command: Terminal,
    set_wake_interval: Activity,
    get_system_info: Activity,
  }
  const toneMap: Record<string, string> = {
    add_goal: result ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-pi-accent/10 border-pi-accent/20 text-pi-accent',
    complete_goal: result ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-pi-accent/10 border-pi-accent/20 text-pi-accent',
    remove_goal: result ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-pi-accent/10 border-pi-accent/20 text-pi-accent',
    list_goals: result ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
    update_mood: result ? 'bg-pink-500/10 border-pink-500/20 text-pink-400' : 'bg-pink-500/10 border-pink-500/20 text-pink-400',
    run_command: result ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' : 'bg-amber-500/10 border-amber-500/20 text-amber-300',
    set_wake_interval: result ? 'bg-violet-500/10 border-violet-500/20 text-violet-300' : 'bg-violet-500/10 border-violet-500/20 text-violet-300',
    get_system_info: result ? 'bg-slate-500/10 border-slate-500/20 text-slate-300' : 'bg-slate-500/10 border-slate-500/20 text-slate-300',
  }
  const Icon = iconMap[toolName] || Wrench
  const toneClass = toneMap[toolName] || (result ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-pi-accent/10 border-pi-accent/20 text-pi-accent')

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="mb-2 ml-9"
    >
      <button
        onClick={() => result && setExpanded(e => !e)}
        className={cn(
          'flex w-full items-center gap-2 rounded-2xl border px-3 py-2 text-left transition-all',
          toneClass,
          result && 'hover:brightness-110 cursor-pointer'
        )}
      >
        <div className="rounded-xl bg-black/10 p-1.5">
          <Icon className={cn('w-3.5 h-3.5', !result && 'animate-spin')} style={result ? undefined : { animationDuration: '2.2s' }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">
            {result ? 'Completed action' : 'Running action'}
          </div>
          <div className="truncate text-[11px] font-medium">
            {labels[toolName] || toolName}
          </div>
        </div>
        {result && <ChevronDown className={cn('w-3 h-3 transition-transform', expanded && 'rotate-180')} />}
      </button>
      {expanded && result && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-1 ml-3 px-2.5 py-1.5 bg-pi-surface rounded-lg border border-pi-border text-[10px] text-pi-text-dim font-mono whitespace-pre-wrap max-h-[100px] overflow-y-auto"
        >
          {result}
        </motion.div>
      )}
    </motion.div>
  )
}

function StreamPhaseChip({
  phase,
  detail,
}: {
  phase: 'idle' | 'thinking' | 'acting' | 'streaming'
  detail?: string
}) {
  const tone = {
    idle: 'text-pi-text-dim bg-pi-surface/50 border-pi-border',
    thinking: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    acting: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    streaming: 'text-pi-accent bg-pi-accent/10 border-pi-accent/20',
  }[phase]

  return (
    <div className={cn('flex items-center gap-2 border-b border-pi-border/50 px-3 py-2 text-[10px]', tone)}>
      <Activity className="h-3 w-3" />
      <span className="font-semibold uppercase tracking-wide">{phase}</span>
      {detail && <span className="truncate text-pi-text-dim">{detail}</span>}
    </div>
  )
}

function ChatEmptyState({
  name,
  brainStatus,
  streamPhase,
  onSuggestion,
  searchMode,
}: {
  name: string
  brainStatus: 'running' | 'sleeping' | 'not-running' | 'error'
  streamPhase: 'idle' | 'thinking' | 'acting' | 'streaming'
  onSuggestion: (value: string) => void
  searchMode: boolean
}) {
  if (searchMode) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex h-full items-center justify-center"
      >
        <div className="max-w-sm rounded-3xl border border-pi-border bg-pi-panel/70 px-6 py-7 text-center shadow-[0_16px_60px_rgba(0,0,0,0.2)] backdrop-blur-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-pi-border bg-pi-surface/70">
            <Search className="h-6 w-6 text-pi-text-dim" />
          </div>
          <p className="text-sm font-semibold text-pi-text">No matching messages</p>
          <p className="mt-2 text-[11px] leading-relaxed text-pi-text-dim">
            Try a different phrase, a business name, or a tool action like command, goal, or opportunity.
          </p>
        </div>
      </motion.div>
    )
  }

  const statusCopy = {
    running: {
      badge: 'Autonomous founder online',
      title: `${name} is awake and managing the founder loop`,
      detail: 'Use this thread to redirect current work, inspect decisions, or pressure-test what Pi-Chi should build next.',
    },
    sleeping: {
      badge: 'Between work cycles',
      title: `${name} is resting between autonomous runs`,
      detail: 'You can still queue direction here. The next wake cycle will pick it up and fold it into the work queue.',
    },
    'not-running': {
      badge: 'Background automation offline',
      title: `${name} is not currently running`,
      detail: 'This chat stays available, but founder work will not advance until the brain loop is running again.',
    },
    error: {
      badge: 'Needs recovery',
      title: `${name} hit a background issue`,
      detail: 'Use the chat to inspect what failed, ask for recovery steps, or steer the next safe action explicitly.',
    },
  }[brainStatus]

  const phaseCopy = {
    idle: 'Ready for a new instruction or autonomous mission update.',
    thinking: 'Reasoning through the next response and deciding what matters most.',
    acting: 'Running actions and waiting for tool results to settle.',
    streaming: 'Pushing a live response back into the thread now.',
  }[streamPhase]

  const suggestions = [
    'What businesses are highest priority right now?',
    'What should Pi-Chi build next to reach $1M ARR faster?',
    'Summarise the current mission, why it was chosen, and what happens next.',
    'Review the portfolio and tell me where growth is stuck.',
  ]

  const quickStats = [
    {
      icon: Activity,
      label: 'Background loop',
      value: brainStatus === 'running' ? 'Live' : brainStatus === 'sleeping' ? 'Queued' : 'Paused',
    },
    {
      icon: Target,
      label: 'Best use of chat',
      value: 'Mission steering',
    },
    {
      icon: Terminal,
      label: 'Operational control',
      value: 'Research, build, recover',
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      className="flex min-h-full items-center justify-center"
    >
      <div className="w-full max-w-3xl space-y-4 py-4">
        <div className="overflow-hidden rounded-[28px] border border-pi-border bg-[radial-gradient(circle_at_top,rgba(0,212,255,0.12),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
          <div className="border-b border-pi-border/70 px-5 py-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-pi-accent/20 bg-pi-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-pi-accent">
                <Sparkles className="h-3 w-3" />
                {statusCopy.badge}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-pi-border bg-pi-surface/60 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-pi-text-dim">
                <Activity className="h-3 w-3" />
                {streamPhase}
              </span>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-12 w-12 items-center justify-center rounded-2xl border border-pi-accent/20 bg-gradient-to-br from-pi-accent/15 to-pi-accent/5">
                <Bot className="h-6 w-6 text-pi-accent" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-pi-text">{statusCopy.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-pi-text-dim">{statusCopy.detail}</p>
                <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-pi-text-dim/80">
                  {phaseCopy}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
            {quickStats.map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-2xl border border-pi-border bg-pi-surface/55 px-3.5 py-3">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-pi-text-dim">
                  <Icon className="h-3.5 w-3.5 text-pi-accent" />
                  {label}
                </div>
                <div className="mt-2 text-sm font-medium text-pi-text">{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[24px] border border-pi-border bg-pi-panel/75 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.14)]">
            <div className="mb-3 flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-pi-accent" />
              <h4 className="text-sm font-semibold text-pi-text">Start with a higher-leverage instruction</h4>
            </div>
            <div className="grid gap-2">
              {suggestions.map((suggestion, index) => (
                <motion.button
                  key={suggestion}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * index, type: 'spring', stiffness: 320, damping: 24 }}
                  onClick={() => onSuggestion(suggestion)}
                  className="group flex w-full items-start gap-3 rounded-2xl border border-pi-border bg-pi-surface/60 px-3.5 py-3 text-left transition-all hover:border-pi-accent/35 hover:bg-pi-surface"
                >
                  <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-xl border border-pi-border bg-pi-panel/70 text-pi-accent">
                    <ArrowDown className="h-3.5 w-3.5 -rotate-45 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>
                  <div>
                    <div className="text-[12px] font-medium leading-relaxed text-pi-text">{suggestion}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-pi-text-dim/80">
                      Load into composer
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-pi-border bg-pi-panel/75 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.14)]">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-pi-accent" />
              <h4 className="text-sm font-semibold text-pi-text">What this thread is for</h4>
            </div>
            <div className="space-y-3 text-[11px] leading-relaxed text-pi-text-dim">
              <div className="rounded-2xl border border-pi-border bg-pi-surface/50 px-3 py-2.5">
                Direct Pi-Chi toward the highest-value business or opportunity instead of issuing low-level one-off tasks.
              </div>
              <div className="rounded-2xl border border-pi-border bg-pi-surface/50 px-3 py-2.5">
                Ask for rationale, blocked work, or the next compounding move when you want better visibility into background automation.
              </div>
              <div className="rounded-2xl border border-pi-border bg-pi-surface/50 px-3 py-2.5">
                Use the dashboard context rail for mission status, opportunity pressure, and recent cycle history. Use chat to steer it.
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

type TimelineItem =
  | { id: string; type: 'date'; date: string; timestamp: string }
  | { id: string; type: 'message'; message: BrainChatMessage; streaming?: boolean }
  | { id: string; type: 'tool-active'; toolName: string; timestamp: string }
  | { id: string; type: 'tool-result'; toolName: string; result: string; timestamp: string }
  | { id: string; type: 'typing'; timestamp: string }

/* ─── Main component ───────────────────────────── */

export function BrainChat({
  chatMessages, brainStatus, brainName,
  onMarkRead, className,
}: BrainChatProps) {
  const [input, setInput] = useState('')
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [localMessages, setLocalMessages] = useState<BrainChatMessage[]>([])
  const [completedStreamText, setCompletedStreamText] = useState<string | null>(null)
  const [queuedLiveUpdates, setQueuedLiveUpdates] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const prevLenRef = useRef(0)
  const isAtBottomRef = useRef(true)

  // Data stream hook
  const stream = useBrainStream()

  // Debounce search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => setSearchDebounced(value), 200)
  }, [])

  const name = brainName || 'Pi-Chi'
  const unreadCount = chatMessages.filter(m => m.from === 'brain' && !m.read).length
  const deferredSearchQuery = useDeferredValue(searchDebounced)

  // Merge optimistic local messages with polled messages
  const mergedMessages = useMemo(() => {
    const confirmedClientIds = new Set(
      chatMessages
        .map(m => m.clientMessageId)
        .filter((id): id is string => Boolean(id))
    )
    const pending = localMessages.filter(m =>
      !(m.clientMessageId && confirmedClientIds.has(m.clientMessageId))
    )
    return [...chatMessages, ...pending]
  }, [chatMessages, localMessages])

  useEffect(() => {
    const confirmedClientIds = new Set(
      chatMessages
        .map(m => m.clientMessageId)
        .filter((id): id is string => Boolean(id))
    )
    if (confirmedClientIds.size === 0) return
    setLocalMessages(prev =>
      prev.filter(m => !(m.clientMessageId && confirmedClientIds.has(m.clientMessageId)))
    )
  }, [chatMessages])

  // Filter messages by search
  const displayMessages = useMemo(() => {
    if (!deferredSearchQuery) return mergedMessages
    const q = deferredSearchQuery.toLowerCase()
    return mergedMessages.filter(m => m.message.toLowerCase().includes(q))
  }, [mergedMessages, deferredSearchQuery])

  // Keep completedStreamText visible until polled message arrives (streaming gap fix)
  useEffect(() => {
    if (!completedStreamText) return

    // Check if the completed text has appeared in polled messages
    const found = chatMessages.some(m =>
      m.from === 'brain' && m.message.slice(0, 50) === completedStreamText.slice(0, 50)
    )
    if (found) {
      setCompletedStreamText(null)
      return
    }

    // Safety timeout — clear after 15s
    const timer = setTimeout(() => setCompletedStreamText(null), 15000)
    return () => clearTimeout(timer)
  }, [completedStreamText, chatMessages])

  // Handle stream errors
  useEffect(() => {
    if (stream.error) {
      setErrorMsg(stream.error)
    }
  }, [stream.error])

  // When stream finishes, capture the text to bridge the gap
  useEffect(() => {
    if (!stream.isStreaming && stream.streamingText) {
      setCompletedStreamText(stream.streamingText)
    }
  }, [stream.isStreaming, stream.streamingText])

  // Auto-scroll on new messages or streaming text
  useEffect(() => {
    const hasNewMessages = mergedMessages.length > prevLenRef.current
    if (hasNewMessages && !isAtBottomRef.current) {
      setQueuedLiveUpdates(prev => prev + (mergedMessages.length - prevLenRef.current))
    }
    if ((hasNewMessages || stream.isStreaming) && scrollRef.current && isAtBottomRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
      })
    }
    prevLenRef.current = mergedMessages.length
  }, [mergedMessages.length, stream.streamingText, stream.isStreaming])

  useEffect(() => {
    if (!isAtBottomRef.current && stream.toolResults.length > 0) {
      setQueuedLiveUpdates(prev => prev + 1)
    }
  }, [stream.toolResults.length])

  // Scroll tracking
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 60
    isAtBottomRef.current = atBottom
    setShowScrollBtn(!atBottom && mergedMessages.length > 5)
    if (atBottom) setQueuedLiveUpdates(0)
  }, [mergedMessages.length])

  // Mark brain messages as read
  useEffect(() => {
    if (unreadCount > 0) onMarkRead()
  }, [unreadCount, onMarkRead])

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    setQueuedLiveUpdates(0)
  }, [])

  const handleSend = useCallback(async () => {
    const msg = input.trim()
    if (!msg || stream.isStreaming) return

    setErrorMsg(null)
    setCompletedStreamText(null)
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'

    // Optimistic user message
    const optimisticMsg: BrainChatMessage = {
      id: `local-${Date.now()}`,
      clientMessageId: `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from: 'owner',
      message: msg,
      timestamp: new Date().toISOString(),
      read: false,
    }
    setLocalMessages(prev => [...prev, optimisticMsg])

    // Stream response
    await stream.send(msg, optimisticMsg.clientMessageId)

    inputRef.current?.focus()
    requestAnimationFrame(() => scrollToBottom())
  }, [input, stream, scrollToBottom])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // Create streaming message to show
  const streamingMessage: BrainChatMessage | null = stream.isStreaming && stream.streamingText ? {
    id: 'streaming',
    from: 'brain',
    message: stream.streamingText,
    timestamp: new Date().toISOString(),
    read: false,
  } : null

  // Show completed stream text while waiting for poll (gap bridge)
  const gapMessage: BrainChatMessage | null = !stream.isStreaming && completedStreamText ? {
    id: 'gap-bridge',
    from: 'brain',
    message: completedStreamText,
    timestamp: new Date().toISOString(),
    read: false,
  } : null

  // Toggle search
  const toggleSearch = useCallback(() => {
    setShowSearch(s => {
      if (!s) setTimeout(() => searchInputRef.current?.focus(), 100)
      else { setSearchQuery(''); setSearchDebounced('') }
      return !s
    })
  }, [])

  const streamPhase = useMemo<'idle' | 'thinking' | 'acting' | 'streaming'>(() => {
    if (stream.activeToolCall) return 'acting'
    if (stream.isStreaming && stream.streamingText) return 'streaming'
    if (stream.isStreaming) return 'thinking'
    return 'idle'
  }, [stream.activeToolCall, stream.isStreaming, stream.streamingText])

  const streamPhaseDetail = stream.activeToolCall
    ? `Using ${stream.activeToolCall.toolName}`
    : stream.toolResults.length > 0
      ? `${stream.toolResults.length} action${stream.toolResults.length > 1 ? 's' : ''} completed`
      : stream.isStreaming
        ? 'Generating live response'
        : brainStatus === 'running'
          ? 'Ready for the next instruction'
          : undefined

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = []

    for (const msg of displayMessages) {
      items.push({
        id: `msg-${msg.id}`,
        type: 'message',
        message: msg,
      })
    }

    for (const result of stream.toolResults) {
      items.push({
        id: `tool-result-${result.toolCallId}`,
        type: 'tool-result',
        toolName: result.toolName,
        result: result.result,
        timestamp: result.occurredAt,
      })
    }

    if (stream.activeToolCall) {
      items.push({
        id: `tool-active-${stream.activeToolCall.toolCallId}`,
        type: 'tool-active',
        toolName: stream.activeToolCall.toolName,
        timestamp: stream.activeToolCall.occurredAt,
      })
    }

    if (streamingMessage) {
      items.push({
        id: 'streaming-message',
        type: 'message',
        message: streamingMessage,
        streaming: true,
      })
    } else if (gapMessage) {
      items.push({
        id: 'gap-message',
        type: 'message',
        message: gapMessage,
      })
    } else if (stream.isStreaming && !stream.activeToolCall) {
      items.push({
        id: 'typing-indicator',
        type: 'typing',
        timestamp: new Date().toISOString(),
      })
    }

    items.sort((a, b) => {
      const aTs = a.type === 'message' ? a.message.timestamp : a.timestamp
      const bTs = b.type === 'message' ? b.message.timestamp : b.timestamp
      return new Date(aTs).getTime() - new Date(bTs).getTime()
    })

    const withDates: TimelineItem[] = []
    let currentDate = ''
    for (const item of items) {
      const ts = item.type === 'message' ? item.message.timestamp : item.timestamp
      const date = formatDate(ts)
      if (date !== currentDate) {
        currentDate = date
        withDates.push({
          id: `date-${date}-${ts}`,
          type: 'date',
          date,
          timestamp: ts,
        })
      }
      withDates.push(item)
    }

    return withDates
  }, [displayMessages, gapMessage, stream.activeToolCall, stream.isStreaming, stream.toolResults, streamingMessage])

  return (
    <div className={cn('h-full flex flex-col relative', className)}>
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-pi-border bg-pi-panel/80 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center',
              'bg-gradient-to-br from-pi-accent/20 to-purple-500/20 border border-pi-accent/30',
              (brainStatus === 'running' || stream.isStreaming) && 'shadow-[0_0_12px_rgba(0,212,255,0.2)]'
            )}>
              <Bot className="w-4 h-4 text-pi-accent" />
            </div>
            <motion.span
              animate={(brainStatus === 'running' || stream.isStreaming) ? {
                scale: [1, 1.3, 1],
                opacity: [1, 0.7, 1],
              } : {}}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className={cn(
                'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-pi-panel',
                (brainStatus === 'running' || stream.isStreaming) ? 'bg-emerald-500' :
                brainStatus === 'sleeping' ? 'bg-yellow-500' :
                'bg-gray-500'
              )}
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-pi-text">{name}</span>
              {(brainStatus === 'running' || stream.isStreaming) && (
                <Sparkles className="w-3 h-3 text-pi-accent animate-pulse" />
              )}
            </div>
            <div className="flex items-center gap-1">
              {brainStatus === 'running' || brainStatus === 'sleeping'
                ? <Wifi className="w-2.5 h-2.5 text-emerald-500" />
                : <WifiOff className="w-2.5 h-2.5 text-red-400" />}
              <span className="text-[10px] text-pi-text-dim">
                {stream.isStreaming ? 'Responding...' :
                 brainStatus === 'running' ? 'Awake & thinking' :
                 brainStatus === 'sleeping' ? 'Sleeping between cycles' :
                 'Offline'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleSearch}
            className={cn(
              'p-1.5 rounded-lg transition-all',
              showSearch ? 'text-pi-accent bg-pi-accent/10' : 'text-pi-text-dim hover:text-pi-text hover:bg-pi-surface'
            )}
            title="Search messages"
          >
            {showSearch ? <X className="w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
          </button>
          <AnimatePresence>
            {stream.isStreaming && (
              <motion.span
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="hidden sm:inline-flex items-center rounded-full border border-pi-accent/20 bg-pi-accent/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-pi-accent"
              >
                Live stream
              </motion.span>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {unreadCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                className="bg-pi-accent text-white text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center shadow-[0_0_8px_rgba(0,212,255,0.3)]"
              >
                {unreadCount}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      <StreamPhaseChip phase={streamPhase} detail={streamPhaseDetail} />

      {/* Search bar */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="overflow-hidden border-b border-pi-border/50"
          >
            <div className="px-3 py-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-pi-text-dim/40" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={e => handleSearchChange(e.target.value)}
                  placeholder="Search messages..."
                  className="w-full bg-pi-surface border border-pi-border rounded-lg pl-7 pr-3 py-1.5 text-[11px] text-pi-text placeholder:text-pi-text-dim/40 focus:outline-none focus:ring-1 focus:ring-pi-accent/50"
                />
              </div>
              {deferredSearchQuery && (
                <p className="text-[9px] text-pi-text-dim mt-1">
                  {displayMessages.length} of {mergedMessages.length} messages
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Messages ─── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-3 scroll-smooth"
      >
        {displayMessages.length === 0 && !stream.isStreaming ? (
          <ChatEmptyState
            name={name}
            brainStatus={brainStatus}
            streamPhase={streamPhase}
            searchMode={Boolean(deferredSearchQuery)}
            onSuggestion={setInput}
          />
        ) : (
          <>
            <AnimatePresence mode="popLayout">
              {timelineItems.map(item => {
                if (item.type === 'date') {
                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, scaleX: 0.5 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      className="flex items-center gap-3 my-4"
                    >
                      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />
                      <span className="text-[10px] text-pi-text-dim/60 font-medium px-2 bg-pi-bg rounded-full border border-pi-border/50 py-0.5">
                        {item.date}
                      </span>
                      <div className="flex-1 h-px bg-gradient-to-l from-transparent via-pi-border to-transparent" />
                    </motion.div>
                  )
                }

                if (item.type === 'message') {
                  return (
                    <MessageBubble
                      key={item.id}
                      msg={item.message}
                      name={name}
                      isStreaming={item.streaming}
                      searchQuery={deferredSearchQuery}
                    />
                  )
                }

                if (item.type === 'tool-active') {
                  return <ToolCallIndicator key={item.id} toolName={item.toolName} />
                }

                if (item.type === 'tool-result') {
                  return <ToolCallIndicator key={item.id} toolName={item.toolName} result={item.result} />
                }

                return <TypingIndicator key={item.id} />
              })}
            </AnimatePresence>
          </>
        )}
      </div>

      {/* ─── Error banner with retry ─── */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-red-500/20 bg-red-500/5 px-3 py-2 flex items-center gap-2"
          >
            <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <p className="text-[11px] text-red-400 flex-1 truncate">{errorMsg}</p>
            {stream.canRetry && (
              <button
                onClick={() => { setErrorMsg(null); stream.retry() }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-red-400 hover:bg-red-500/10 transition-all"
              >
                <RotateCcw className="w-3 h-3" /> Retry
              </button>
            )}
            <button
              onClick={() => setErrorMsg(null)}
              className="p-1 rounded-lg text-red-400/50 hover:text-red-400 transition-all"
            >
              <X className="w-3 h-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Scroll-to-bottom FAB ─── */}
      <AnimatePresence>
        {showScrollBtn && (
          <motion.button
            initial={{ opacity: 0, scale: 0, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            onClick={scrollToBottom}
            className="absolute bottom-20 right-4 flex min-h-8 items-center gap-1 rounded-full bg-pi-surface/95 px-2.5 py-1.5 border border-pi-border shadow-lg backdrop-blur-sm hover:bg-pi-accent hover:text-white hover:border-pi-accent transition-all z-10"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            {queuedLiveUpdates > 0 && (
              <span className="text-[10px] font-semibold">{Math.min(queuedLiveUpdates, 9)} new</span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* ─── Input area ─── */}
      <div className="px-3 py-2.5 border-t border-pi-border bg-pi-panel/80 backdrop-blur-sm">
        <div className="mb-2 flex items-center justify-between px-1">
          <div className="text-[10px] text-pi-text-dim">
            {stream.isStreaming
              ? stream.activeToolCall
                ? `Working with ${stream.activeToolCall.toolName}`
                : 'Receiving live response'
              : brainStatus === 'running'
                ? 'Pi-Chi is awake'
                : 'Pi-Chi is between cycles'}
          </div>
          <div className="text-[9px] uppercase tracking-[0.14em] text-pi-text-dim/70">
            {stream.toolResults.length > 0 ? `${stream.toolResults.length} action${stream.toolResults.length === 1 ? '' : 's'}` : 'Direct line'}
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1 relative input-focus-glow rounded-xl">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${name}...`}
              rows={1}
              disabled={stream.isStreaming}
              className={cn(
                'w-full resize-none bg-pi-surface border border-pi-border rounded-xl px-3.5 py-2.5',
                'text-[13px] text-pi-text placeholder:text-pi-text-dim/40',
                'focus:outline-none',
                'max-h-[120px] min-h-[44px]',
                'transition-all duration-200',
                stream.isStreaming && 'opacity-50'
              )}
              style={{ height: 'auto', minHeight: '44px' }}
              onInput={e => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = Math.min(el.scrollHeight, 120) + 'px'
              }}
            />
          </div>
          <motion.button
            onClick={handleSend}
            disabled={!input.trim() || stream.isStreaming}
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.05 }}
            className={cn(
              'shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200',
              input.trim() && !stream.isStreaming
                ? 'bg-gradient-to-br from-pi-accent to-pi-accent-hover text-white shadow-[0_0_12px_rgba(0,212,255,0.25)] hover:shadow-[0_0_20px_rgba(0,212,255,0.35)]'
                : 'bg-pi-surface text-pi-text-dim/30 cursor-not-allowed'
            )}
            aria-label="Send message"
          >
            {stream.isStreaming ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
              />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </motion.button>
        </div>
      </div>
    </div>
  )
}
