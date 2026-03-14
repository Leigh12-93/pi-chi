'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  Send, MessageCircle, Bot, Check, CheckCheck,
  Sparkles, Wifi, WifiOff, ArrowDown, Wrench, Search, X,
} from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
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

function MessageBubble({ msg, name, isStreaming, searchQuery }: { msg: BrainChatMessage; name: string; isStreaming?: boolean; searchQuery?: string }) {
  const isOwner = msg.from === 'owner'
  const prefersReducedMotion = useReducedMotion()

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

      <div className={cn(
        'max-w-[80%] relative group',
        isOwner ? 'order-1' : 'order-2'
      )}>
        {/* Bubble */}
        <div className={cn(
          'rounded-2xl px-3.5 py-2.5 shadow-sm transition-shadow duration-300',
          isOwner
            ? 'bg-gradient-to-br from-pi-accent to-pi-accent-hover text-white rounded-br-md shadow-pi-accent/10 hover:shadow-pi-accent/20 hover:shadow-md'
            : 'bg-pi-surface border border-pi-border text-pi-text rounded-bl-md hover:border-pi-accent/20 hover:shadow-md',
          isStreaming && !isOwner && 'border-pi-accent/30'
        )}>
          {/* Sender label */}
          {!isOwner && (
            <span className="text-[9px] font-semibold text-pi-accent block mb-0.5">
              {name}
            </span>
          )}

          {/* Message body */}
          <p className={cn(
            'text-[13px] leading-relaxed whitespace-pre-wrap break-words',
            isOwner ? 'text-white' : 'text-pi-text'
          )}>
            {searchQuery ? <HighlightText text={msg.message} query={searchQuery} /> : msg.message}
            {isStreaming && (
              <motion.span
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.5, repeat: Infinity }}
                className="inline-block w-0.5 h-[14px] bg-pi-accent ml-0.5 align-text-bottom"
              />
            )}
          </p>

          {/* Timestamp + read receipt */}
          <div className={cn(
            'flex items-center gap-1 mt-1',
            isOwner ? 'justify-end' : 'justify-start'
          )}>
            <span className={cn(
              'text-[9px]',
              isOwner ? 'text-white/50' : 'text-pi-text-dim/40'
            )}>
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
                  : <Check className="w-3 h-3 text-white/40" />
                }
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
}

/* ─── Tool call indicator ──────────────────────── */

function ToolCallIndicator({ toolName }: { toolName: string }) {
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
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="flex items-center gap-2 mb-2 ml-9"
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-pi-accent/10 border border-pi-accent/20">
        <Wrench className="w-3 h-3 text-pi-accent animate-spin" style={{ animationDuration: '2s' }} />
        <span className="text-[10px] text-pi-accent font-medium">{labels[toolName] || toolName}</span>
      </div>
    </motion.div>
  )
}

/* ─── Stream parser ────────────────────────────── */

async function streamBrainChat(
  message: string,
  onText: (text: string) => void,
  _onToolCall: (toolName: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
) {
  try {
    const res = await fetch('/api/brain/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }))
      onError(err.error || `HTTP ${res.status}`)
      return
    }

    const reader = res.body?.getReader()
    if (!reader) {
      onError('No response stream')
      return
    }

    const decoder = new TextDecoder()
    let accumulated = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      accumulated += chunk
      onText(accumulated)
    }

    onDone()
  } catch (err) {
    onError(err instanceof Error ? err.message : 'Connection failed')
  }
}

/* ─── Main component ───────────────────────────── */

export function BrainChat({
  chatMessages, brainStatus, brainName,
  onMarkRead, className,
}: BrainChatProps) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [activeToolCall, setActiveToolCall] = useState<string | null>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const prevLenRef = useRef(0)
  const isAtBottomRef = useRef(true)

  // Debounce search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => setSearchDebounced(value), 200)
  }, [])

  const name = brainName || 'Pi-Chi'
  const unreadCount = chatMessages.filter(m => m.from === 'brain' && !m.read).length

  // Filter messages by search
  const displayMessages = useMemo(() => {
    if (!searchDebounced) return chatMessages
    const q = searchDebounced.toLowerCase()
    return chatMessages.filter(m => m.message.toLowerCase().includes(q))
  }, [chatMessages, searchDebounced])

  // Auto-scroll on new messages or streaming text
  useEffect(() => {
    if ((chatMessages.length > prevLenRef.current || isStreaming) && scrollRef.current && isAtBottomRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
      })
    }
    prevLenRef.current = chatMessages.length
  }, [chatMessages.length, streamingText, isStreaming])

  // Scroll tracking
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 60
    isAtBottomRef.current = atBottom
    setShowScrollBtn(!atBottom && chatMessages.length > 5)
  }, [chatMessages.length])

  // Mark brain messages as read
  useEffect(() => {
    if (unreadCount > 0) onMarkRead()
  }, [unreadCount, onMarkRead])

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [])

  const handleSend = useCallback(async () => {
    const msg = input.trim()
    if (!msg || sending) return
    setSending(true)
    setIsStreaming(true)
    setStreamingText('')
    setActiveToolCall(null)
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'

    // Stream response from Pi-Chi (the endpoint saves messages to brain-state)
    await streamBrainChat(
      msg,
      (text) => {
        setStreamingText(text)
        setActiveToolCall(null) // Clear tool call when text arrives
      },
      (toolName) => {
        setActiveToolCall(toolName)
      },
      () => {
        setIsStreaming(false)
        setStreamingText('')
        setActiveToolCall(null)
        setSending(false)
      },
      (error) => {
        console.error('Brain chat error:', error)
        setIsStreaming(false)
        setStreamingText('')
        setActiveToolCall(null)
        setSending(false)
      },
    )

    inputRef.current?.focus()
    requestAnimationFrame(() => scrollToBottom())
  }, [input, sending, scrollToBottom])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: BrainChatMessage[] }[] = []
    let currentDate = ''
    for (const msg of displayMessages) {
      const date = formatDate(msg.timestamp)
      if (date !== currentDate) {
        currentDate = date
        groups.push({ date, messages: [] })
      }
      groups[groups.length - 1].messages.push(msg)
    }
    return groups
  }, [displayMessages])

  // Create a temporary streaming message to show
  const streamingMessage: BrainChatMessage | null = isStreaming && streamingText ? {
    id: 'streaming',
    from: 'brain',
    message: streamingText,
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

  return (
    <div className={cn('h-full flex flex-col relative', className)}>
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-pi-border bg-pi-panel/80 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center',
              'bg-gradient-to-br from-pi-accent/20 to-purple-500/20 border border-pi-accent/30',
              (brainStatus === 'running' || isStreaming) && 'shadow-[0_0_12px_rgba(0,212,255,0.2)]'
            )}>
              <Bot className="w-4 h-4 text-pi-accent" />
            </div>
            <motion.span
              animate={(brainStatus === 'running' || isStreaming) ? {
                scale: [1, 1.3, 1],
                opacity: [1, 0.7, 1],
              } : {}}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className={cn(
                'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-pi-panel',
                (brainStatus === 'running' || isStreaming) ? 'bg-emerald-500' :
                brainStatus === 'sleeping' ? 'bg-yellow-500' :
                'bg-gray-500'
              )}
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-pi-text">{name}</span>
              {(brainStatus === 'running' || isStreaming) && (
                <Sparkles className="w-3 h-3 text-pi-accent animate-pulse" />
              )}
            </div>
            <div className="flex items-center gap-1">
              {brainStatus === 'running' || brainStatus === 'sleeping'
                ? <Wifi className="w-2.5 h-2.5 text-emerald-500" />
                : <WifiOff className="w-2.5 h-2.5 text-red-400" />
              }
              <span className="text-[10px] text-pi-text-dim">
                {isStreaming ? 'Responding...' :
                 brainStatus === 'running' ? 'Awake & thinking' :
                 brainStatus === 'sleeping' ? 'Sleeping between cycles' :
                 'Offline'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Search toggle */}
          <button
            onClick={toggleSearch}
            className={cn(
              'p-1.5 rounded-lg transition-all',
              showSearch ? 'text-pi-accent bg-pi-accent/10' : 'text-pi-text-dim hover:text-pi-text hover:bg-pi-surface'
            )}
            title="Search messages"
            aria-label="Search messages"
          >
            {showSearch ? <X className="w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
          </button>

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
              {searchDebounced && (
                <p className="text-[9px] text-pi-text-dim mt-1">
                  {displayMessages.length} of {chatMessages.length} messages
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
        {displayMessages.length === 0 && !isStreaming ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 25 }}
            className="flex flex-col items-center justify-center h-full text-pi-text-dim"
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <MessageCircle className="w-12 h-12 mb-4 opacity-15" />
            </motion.div>
            <p className="text-sm font-semibold text-pi-text">
              {searchDebounced ? 'No matching messages' : `Chat with ${name}`}
            </p>
            <p className="text-[11px] mt-1.5 text-center max-w-[240px] leading-relaxed">
              {searchDebounced
                ? 'Try a different search term.'
                : `Send a message and ${name} will respond instantly.`}
            </p>
            {!searchDebounced && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-4 flex gap-2"
              >
                {['Hey!', 'What are you working on?', 'How are you?'].map((q, i) => (
                  <motion.button
                    key={q}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 + i * 0.1, type: 'spring', stiffness: 400, damping: 25 }}
                    onClick={() => setInput(q)}
                    className="text-[10px] px-3 py-1.5 rounded-full bg-pi-surface border border-pi-border hover:border-pi-accent/40 hover:text-pi-accent transition-all hover:shadow-sm active:scale-95"
                  >
                    {q}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </motion.div>
        ) : (
          <>
            {groupedMessages.map(group => (
              <div key={group.date}>
                {/* Date divider */}
                <motion.div
                  initial={{ opacity: 0, scaleX: 0.5 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  className="flex items-center gap-3 my-4"
                >
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />
                  <span className="text-[10px] text-pi-text-dim/60 font-medium px-2 bg-pi-bg rounded-full border border-pi-border/50 py-0.5">
                    {group.date}
                  </span>
                  <div className="flex-1 h-px bg-gradient-to-l from-transparent via-pi-border to-transparent" />
                </motion.div>

                <AnimatePresence mode="popLayout">
                  {group.messages.map(msg => (
                    <MessageBubble key={msg.id} msg={msg} name={name} searchQuery={searchDebounced} />
                  ))}
                </AnimatePresence>
              </div>
            ))}

            {/* Tool call indicator */}
            <AnimatePresence>
              {activeToolCall && <ToolCallIndicator toolName={activeToolCall} />}
            </AnimatePresence>

            {/* Streaming message */}
            <AnimatePresence>
              {streamingMessage && (
                <MessageBubble msg={streamingMessage} name={name} isStreaming />
              )}
            </AnimatePresence>

            {/* Typing indicator (before first text arrives) */}
            <AnimatePresence>
              {isStreaming && !streamingText && !activeToolCall && <TypingIndicator />}
            </AnimatePresence>
          </>
        )}
      </div>

      {/* ─── Scroll-to-bottom FAB ─── */}
      <AnimatePresence>
        {showScrollBtn && (
          <motion.button
            initial={{ opacity: 0, scale: 0, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            onClick={scrollToBottom}
            className="absolute bottom-20 right-4 w-8 h-8 rounded-full bg-pi-surface border border-pi-border shadow-lg flex items-center justify-center hover:bg-pi-accent hover:text-white hover:border-pi-accent transition-all z-10"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ─── Input area ─── */}
      <div className="px-3 py-2.5 border-t border-pi-border bg-pi-panel/80 backdrop-blur-sm">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative input-focus-glow rounded-xl">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${name}...`}
              rows={1}
              disabled={sending}
              className={cn(
                'w-full resize-none bg-pi-surface border border-pi-border rounded-xl px-3.5 py-2.5',
                'text-[13px] text-pi-text placeholder:text-pi-text-dim/40',
                'focus:outline-none',
                'max-h-[120px] min-h-[44px]',
                'transition-all duration-200',
                sending && 'opacity-50'
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
            disabled={!input.trim() || sending}
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.05 }}
            className={cn(
              'shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200',
              input.trim() && !sending
                ? 'bg-gradient-to-br from-pi-accent to-pi-accent-hover text-white shadow-[0_0_12px_rgba(0,212,255,0.25)] hover:shadow-[0_0_20px_rgba(0,212,255,0.35)]'
                : 'bg-pi-surface text-pi-text-dim/30 cursor-not-allowed'
            )}
            aria-label="Send message"
          >
            {sending ? (
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
