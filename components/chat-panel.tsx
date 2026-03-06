'use client'

import { useState, useRef, useEffect, useMemo, memo } from 'react'
import {
  Loader2, Check, Trash2, Brain,
  Sparkles, ArrowUp, StopCircle,
  AlertTriangle, ChevronDown, Clock,
  Globe, FileText, FolderPlus,
  Paperclip, ImageIcon, X, CheckCircle, Mic,
} from 'lucide-react'
import { TOOL_LABELS, colorClasses } from '@/lib/chat/constants'
import { getPhaseLabel } from '@/lib/chat/tool-utils'
import { cn } from '@/lib/utils'
import { ErrorBoundary } from '@/components/error-boundary'
import { motion, AnimatePresence } from 'framer-motion'
import { MODEL_OPTIONS, QUICK_ACTIONS } from '@/lib/chat/constants'
import { MessageItem } from '@/components/chat/message-item'
import { ApprovalCard } from '@/components/approval-card'
import { TaskListPanel } from '@/components/chat/task-list-panel'
import { useForgeChat, type UseForgeChatProps } from '@/hooks/use-forge-chat'
import { useVoiceInput } from '@/hooks/use-voice-input'
import { toast } from 'sonner'

/** Rotating messages shown during extended thinking (Opus etc.) */
const THINKING_MESSAGES = [
  'Thinking deeply',
  'Reasoning through the problem',
  'Analyzing your codebase',
  'Considering the best approach',
  'Planning the implementation',
  'Evaluating options',
  'Working through the details',
  'Almost ready',
]

const THINKING_MILESTONES = [
  { at: 10, text: 'This model thinks before responding' },
  { at: 30, text: 'Deep reasoning in progress' },
  { at: 60, text: 'Still working - complex problems take time' },
  { at: 120, text: 'Extended thinking - hang tight' },
  { at: 180, text: 'Long reasoning session - almost there' },
  { at: 240, text: 'This is a deep one - still going' },
  { at: 300, text: 'Nearly done thinking' },
]

function ThinkingIndicator({ elapsed, formatElapsed, stepCount, lastCompletedToolName, status }: {
  elapsed: number
  formatElapsed: (s: number) => string
  stepCount: number
  lastCompletedToolName: string | null
  status: string
}) {
  // Rotate through thinking messages every 6 seconds
  const [messageIdx, setMessageIdx] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIdx(prev => (prev + 1) % THINKING_MESSAGES.length)
    }, 6000)
    return () => clearInterval(interval)
  }, [])

  // Get the appropriate milestone message based on elapsed time
  const milestone = useMemo(() => {
    let msg = ''
    for (const m of THINKING_MILESTONES) {
      if (elapsed >= m.at) msg = m.text
    }
    return msg
  }, [elapsed])

  const isSubmitted = status === 'submitted'
  const isExtendedThinking = isSubmitted && elapsed >= 2
  const phaseLabel = getPhaseLabel(lastCompletedToolName)

  // Context line — what it just did or is working on
  const contextLine = useMemo(() => {
    if (stepCount > 0 && lastCompletedToolName) {
      const lastAction = getPhaseLabel(lastCompletedToolName)
      return `${stepCount} step${stepCount !== 1 ? 's' : ''} done — last: ${lastAction.toLowerCase()}`
    }
    if (stepCount > 0) return `${stepCount} step${stepCount !== 1 ? 's' : ''} completed`
    return null
  }, [stepCount, lastCompletedToolName])

  // Extended thinking: flat inline timeline item (no card)
  if (isExtendedThinking) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className={cn("tool-timeline-item space-y-0.5", elapsed >= 10 && "thinking-glow rounded-lg px-1 -mx-1")}
      >
        <div className="flex items-center gap-2.5 py-1">
          <div className="w-5 h-5 rounded-md bg-forge-accent/10 border border-forge-accent/20 flex items-center justify-center shrink-0 icon-glow-pulse">
            <Brain className="w-3 h-3 text-forge-accent thinking-brain" />
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <span className="text-[13px] text-forge-text font-medium shimmer-text thinking-text-rotate" key={messageIdx}>
              {THINKING_MESSAGES[messageIdx]}
            </span>
            <span className="flex items-center gap-0.5">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </span>
          </div>
          <span className="text-[11px] text-forge-text-dim/40 font-mono shrink-0 tabular-nums">
            {formatElapsed(elapsed)}
          </span>
        </div>
        {/* Secondary breakdown line */}
        {(milestone || contextLine) && (
          <div className="pl-[30px] space-y-0.5">
            {contextLine && (
              <p className="text-[11px] text-forge-text-dim/50 tabular-nums">
                {contextLine}
              </p>
            )}
            {milestone && elapsed >= 10 && (
              <p className="text-[11px] text-forge-text-dim/40 thinking-text-rotate" key={milestone}>
                {milestone}
              </p>
            )}
          </div>
        )}
      </motion.div>
    )
  }

  // Standard between-tools indicator: flat inline timeline item (no card)
  return (
    <div className="tool-timeline-item">
      <div className="flex items-center gap-2.5 py-1">
        {isSubmitted ? (
          <div className="w-5 h-5 rounded-md bg-forge-accent/10 flex items-center justify-center shrink-0 icon-glow-pulse">
            <Brain className="w-3 h-3 text-forge-accent thinking-brain" />
          </div>
        ) : (
          <div className="w-5 h-5 rounded-md bg-forge-surface flex items-center justify-center shrink-0">
            <span className="flex items-center gap-0.5">
              <span className="typing-dot !w-[3px] !h-[3px]" />
              <span className="typing-dot !w-[3px] !h-[3px]" />
              <span className="typing-dot !w-[3px] !h-[3px]" />
            </span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <span className={cn('text-[13px] text-forge-text-dim', isSubmitted && 'shimmer-task')}>
            {isSubmitted ? 'Thinking' : phaseLabel}
          </span>
          {isSubmitted && contextLine && (
            <p className="text-[11px] text-forge-text-dim/40 mt-0.5">
              {contextLine}
            </p>
          )}
        </div>
        {elapsed > 0 && (
          <span className="text-[11px] text-forge-text-dim/40 font-mono shrink-0 tabular-nums">
            {formatElapsed(elapsed)}
          </span>
        )}
      </div>
    </div>
  )
}

export type ChatPanelProps = UseForgeChatProps & {
  onLoadingChange?: (isLoading: boolean) => void
}

/** Brief "response complete" signal -- flat inline timeline item */
function CompletionSignal({ stepCount, elapsed, formatElapsed }: {
  stepCount: number
  elapsed: number
  formatElapsed: (s: number) => string
}) {
  const parts: string[] = []
  if (stepCount > 0) parts.push(`${stepCount} action${stepCount !== 1 ? 's' : ''}`)
  if (elapsed > 0) parts.push(formatElapsed(elapsed))

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="tool-timeline-item response-complete-signal"
    >
      <div className="flex items-center gap-2.5 py-1">
        <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40">
          <CheckCircle className="w-3 h-3 animate-check-in" />
        </div>
        <span className="text-[13px] text-forge-text-dim font-medium">Done</span>
        {parts.length > 0 && (
          <span className="text-[11px] text-forge-text-dim/40">
            {parts.join(' in ')}
          </span>
        )}
      </div>
    </motion.div>
  )
}

export const ChatPanel = memo(function ChatPanel({ onLoadingChange, ...props }: ChatPanelProps) {
  const chat = useForgeChat(props)
  const [isDraggingChat, setIsDraggingChat] = useState(false)
  const [dismissedError, setDismissedError] = useState<string | null>(null)
  const [hintsDismissed, setHintsDismissed] = useState(() => {
    try { return localStorage.getItem('forge-hints-dismissed') === '1' } catch { return false }
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)

  // iOS keyboard fix: adjust composer position when virtual keyboard opens
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const handler = () => {
      if (composerRef.current) {
        const offset = window.innerHeight - vv.height - vv.offsetTop
        composerRef.current.style.transform = offset > 0 ? `translateY(-${offset}px)` : ''
      }
    }
    vv.addEventListener('resize', handler)
    vv.addEventListener('scroll', handler)
    return () => {
      vv.removeEventListener('resize', handler)
      vv.removeEventListener('scroll', handler)
    }
  }, [])

  const voice = useVoiceInput({
    onTranscript: (text) => {
      chat.setInput(prev => {
        const separator = prev.trim() ? ' ' : ''
        return prev + separator + text
      })
    },
    onError: (msg) => toast.error(msg),
  })

  // Bubble loading state to parent (workspace auto-switching)
  useEffect(() => {
    onLoadingChange?.(chat.isLoading)
  }, [chat.isLoading, onLoadingChange])

  // Track completion signal: show briefly when streaming ends
  const [showComplete, setShowComplete] = useState(false)
  const [completionStats, setCompletionStats] = useState({ stepCount: 0, elapsed: 0 })
  const wasLoadingRef = useRef(false)
  useEffect(() => {
    if (wasLoadingRef.current && !chat.isLoading && !chat.error) {
      // Streaming just finished
      setCompletionStats({ stepCount: chat.stepCount, elapsed: chat.elapsed })
      setShowComplete(true)
      const timer = setTimeout(() => setShowComplete(false), 2500)
      return () => clearTimeout(timer)
    }
    wasLoadingRef.current = chat.isLoading
  }, [chat.isLoading, chat.error, chat.stepCount, chat.elapsed])

  return (
    <ErrorBoundary>
    <div className="h-full flex flex-col bg-forge-bg">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto" onScroll={chat.handleScroll} role="log" aria-live="polite" aria-label="Chat messages">
        <AnimatePresence mode="wait">
          {chat.loadingHistory ? (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="px-4 py-6 space-y-4"
            >
              {[1, 2, 3].map(i => (
                <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-end' : 'justify-start')}>
                  <div className={cn(
                    'rounded-2xl p-3.5 space-y-2',
                    i % 2 === 0 ? 'bg-forge-surface w-2/3' : 'bg-forge-surface w-3/4',
                  )}>
                    <div className="h-3 rounded animate-skeleton w-full" />
                    <div className="h-3 rounded animate-skeleton w-4/5" />
                    {i % 2 !== 0 && <div className="h-3 rounded animate-skeleton w-3/5" />}
                  </div>
                </div>
              ))}
            </motion.div>
          ) : chat.isEmpty ? (
            <motion.div
              key="empty-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center justify-center h-full px-6"
            >
              <div className="w-14 h-14 rounded-2xl bg-forge-surface border border-forge-border flex items-center justify-center mb-5 animate-breathe">
                <Sparkles className="w-7 h-7 text-forge-accent/70" />
              </div>
              <h2 className="text-xl font-semibold text-forge-text mb-1.5 text-balance text-center tracking-tight">What shall we build?</h2>
              <p className="text-[13px] text-forge-text-dim text-center mb-8 text-pretty">Describe your idea and Six-Chi will build it</p>
              <div className="grid grid-cols-2 gap-2.5 w-full max-w-sm">
                {QUICK_ACTIONS.map((action, i) => (
                  <motion.button
                    key={action.label}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => chat.handleSend(action.query)}
                    className="flex flex-col items-center gap-2 p-4 text-center text-[12.5px] rounded-xl border border-forge-border bg-forge-bg hover:border-forge-accent/25 hover:bg-forge-surface/50 hover:shadow-sm transition-all group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-forge-surface border border-forge-border flex items-center justify-center group-hover:border-forge-accent/25 group-hover:shadow-sm group-hover:shadow-forge-accent/10 transition-all duration-200">
                      <action.icon className="w-4 h-4 text-forge-text-dim group-hover:text-forge-accent transition-colors" />
                    </div>
                    <span className="text-forge-text-dim group-hover:text-forge-text font-medium transition-colors">{action.label}</span>
                  </motion.button>
                ))}
              </div>

              {/* Keyboard hint chips */}
              {!hintsDismissed && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.3 }}
                  className="flex items-center gap-2 mt-6"
                >
                  {[
                    { key: 'Ctrl+K', label: 'Commands' },
                    { key: 'Ctrl+/', label: 'Shortcuts' },
                    { key: 'Ctrl+S', label: 'Save' },
                  ].map((hint, i) => (
                    <motion.span
                      key={hint.key}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: 0.35 + i * 0.05 }}
                      className="text-[10px] text-forge-text-dim/50"
                    >
                      <kbd className="px-1.5 py-0.5 rounded bg-forge-surface border border-forge-border font-mono text-[9px]">{hint.key}</kbd>
                      {' '}{hint.label}
                    </motion.span>
                  ))}
                  <button
                    onClick={() => {
                      setHintsDismissed(true)
                      try { localStorage.setItem('forge-hints-dismissed', '1') } catch {}
                    }}
                    className="ml-1 p-0.5 text-forge-text-dim/30 hover:text-forge-text-dim transition-colors rounded"
                    aria-label="Dismiss keyboard hints"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="messages"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
              className="px-4 py-4 space-y-4" role="log" aria-label="Chat messages" aria-live="polite"
            >
            {chat.messages.map((message, idx) => (
              <div key={message.id} className={idx === chat.messages.length - 1 ? 'v0-message-in' : undefined}>
                <MessageItem
                  message={message}
                  copiedId={chat.copiedId}
                  isEditing={chat.editingMessageId === message.id}
                  editingContent={chat.editingContent}
                  isLoading={chat.isLoading}
                  isLast={idx === chat.messages.length - 1}
                  envVars={chat.envVars}
                  messageCost={message.role === 'assistant' ? chat.getMessageCost(message.id) : null}
                  onCopy={chat.handleCopy}
                  onEditMessage={chat.handleEditMessage}
                  onSaveEdit={chat.handleSaveEdit}
                  onCancelEdit={() => chat.setEditingMessageId(null)}
                  onSetEditingContent={chat.setEditingContent}
                  onRegenerate={chat.handleRegenerate}
                  onEnvVarsSave={chat.handleEnvVarsSave}
                  onCancelTask={chat.handleCancelTask}
                />
              </div>
            ))}

            {/* Approval gate card */}
            <AnimatePresence>
              {chat.pendingApproval && (
                <ApprovalCard
                  toolName={chat.pendingApproval.toolName}
                  args={chat.pendingApproval.args}
                  onApprove={() => chat.handleApprove(chat.pendingApproval!.key)}
                  onDeny={() => chat.handleDeny(chat.pendingApproval!.key)}
                />
              )}
            </AnimatePresence>

            {/* Streaming task checklist — sticky at bottom of scroll area */}
            <AnimatePresence>
            {chat.isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="sticky bottom-0 z-10 bg-gradient-to-t from-forge-bg via-forge-bg/95 to-transparent pt-4 pb-1 -mb-3"
              >
                {/* Completed steps — checkbox checklist */}
                {chat.currentActivity?.recentCompleted && chat.currentActivity.recentCompleted.length > 0 && (
                  <div className="space-y-0.5 mb-1">
                    {chat.currentActivity.recentCompleted.map((completed: { toolName: string; args: Record<string, unknown> }, idx: number) => {
                      const cInfo = TOOL_LABELS[completed.toolName] || { label: completed.toolName.replace(/_/g, ' '), Icon: Check, color: 'gray' }
                      const cArgs = completed.args as Record<string, string>
                      const cPath = cArgs.path || cArgs.file || cArgs.filePath || cArgs.file_path || ''
                      const cFileName = cPath ? cPath.split('/').pop() : ''
                      return (
                        <div key={`step-${idx}`} className="flex items-center gap-2 py-0.5 pl-1">
                          <CheckCircle className="w-3.5 h-3.5 text-forge-success/70 shrink-0" />
                          <span className="text-[12px] text-forge-text-dim/60 truncate">
                            {cInfo.label}{cFileName ? ` — ${cFileName}` : ''}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
                {/* Current active step or thinking indicator */}
                {chat.currentActivity?.toolName ? (() => {
                  const info = TOOL_LABELS[chat.currentActivity.toolName] || { label: chat.currentActivity.toolName.replace(/_/g, ' '), Icon: Loader2, color: 'gray' }
                  const args = chat.currentActivity.args as Record<string, string>
                  const filePath = args.path || args.file || args.filePath || args.file_path || ''
                  const fileName = filePath ? filePath.split('/').pop() : ''
                  return (
                    <div className="flex items-center gap-2 py-0.5 pl-1">
                      <Loader2 className="w-3.5 h-3.5 text-forge-accent animate-spin shrink-0" />
                      <span className="text-[12px] text-forge-text font-medium shimmer-text truncate">
                        {info.label}{fileName ? ` — ${fileName}` : ''}
                      </span>
                      {chat.elapsed > 0 && (
                        <span className="text-[11px] text-forge-text-dim/40 font-mono shrink-0 tabular-nums ml-auto">
                          {chat.formatElapsed(chat.elapsed)}
                        </span>
                      )}
                    </div>
                  )
                })() : (
                  <ThinkingIndicator
                    elapsed={chat.elapsed}
                    formatElapsed={chat.formatElapsed}
                    stepCount={chat.stepCount}
                    lastCompletedToolName={chat.lastCompletedToolName}
                    status={chat.status}
                  />
                )}
              </motion.div>
            )}
            </AnimatePresence>

            {/* Response complete signal */}
            <AnimatePresence>
              {showComplete && !chat.isLoading && (
                <CompletionSignal
                  stepCount={completionStats.stepCount}
                  elapsed={completionStats.elapsed}
                  formatElapsed={chat.formatElapsed}
                />
              )}
            </AnimatePresence>

            {/* Error banner */}
            <AnimatePresence>
              {chat.error && dismissedError !== chat.errorMessage && (
                <motion.div
                  key={chat.errorMessage}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-start gap-2.5 text-[12.5px] bg-red-50/80 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 animate-shake"
                >
                  <div className="w-6 h-6 rounded-lg bg-red-100 dark:bg-red-900/50 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-red-700 dark:text-red-400 mb-0.5">Something went wrong</p>
                    <p className="text-red-500 dark:text-red-400/80 leading-relaxed">{chat.errorMessage}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => chat.regenerate()}
                      className="px-3 py-1.5 bg-red-100 dark:bg-red-900/50 hover:bg-red-200 dark:hover:bg-red-800/60 text-red-700 dark:text-red-400 rounded-lg text-[11px] font-medium transition-colors"
                    >
                      Retry
                    </button>
                    <button
                      onClick={() => setDismissedError(chat.errorMessage)}
                      className="p-1 text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors rounded-md hover:bg-red-100 dark:hover:bg-red-900/40"
                      aria-label="Dismiss error"
                      title="Dismiss"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={chat.messagesEndRef} />
          </motion.div>
        )}
        </AnimatePresence>

      </div>

      {/* New messages / scroll to bottom — anchored above input, outside scroll container */}
      <AnimatePresence>
        {chat.showNewMessageIndicator && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex justify-center py-1.5 shrink-0"
          >
            <button
              onClick={chat.scrollToBottom}
              className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-forge-text bg-forge-surface/95 backdrop-blur-sm border border-forge-border rounded-full shadow-lg hover:bg-forge-surface-hover transition-colors"
            >
              <ChevronDown className="w-3 h-3" />
              {chat.isLoading ? 'New messages' : 'Scroll to bottom'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task list */}
      <AnimatePresence>
        {chat.tasks.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="border-t border-forge-border px-3 py-2 shrink-0 max-h-[200px] overflow-y-auto"
          >
            <TaskListPanel tasks={chat.tasks} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area */}
      <div className="border-t border-forge-border shrink-0 safe-bottom">
        {/* Voice interim text */}
        <AnimatePresence>
          {voice.isListening && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className="h-0.5 bg-red-100 dark:bg-red-900/30 animate-recording-sweep" />
              {voice.interimText && (
                <div className="px-4 pt-2 text-[12px] text-forge-text-dim/60 italic truncate">
                  {voice.interimText}...
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Composer */}
        <div
          ref={composerRef}
          className="p-3 transition-transform duration-100"
          onDragOver={(e) => { e.preventDefault(); setIsDraggingChat(true) }}
          onDragLeave={() => setIsDraggingChat(false)}
          onDrop={async (e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDraggingChat(false)
            if (e.dataTransfer.files.length > 0) {
              await chat.handleAttachFiles(e.dataTransfer.files)
            }
          }}
        >
          <div className="relative bg-forge-surface border border-forge-border rounded-xl shadow-[inset_0_1px_2px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] composer-focus-glow transition-all">
            {/* Drag overlay */}
            <AnimatePresence>
              {isDraggingChat && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-0 z-10 rounded-xl border-2 border-dashed border-forge-accent bg-forge-accent/10 flex items-center justify-center pointer-events-none"
                >
                  <span className="text-[12px] font-medium text-forge-accent">Drop files here</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Attachment chips */}
            {chat.attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
                <AnimatePresence mode="popLayout">
                  {chat.attachments.map((att, i) => (
                    <motion.div
                      key={att.filename || i}
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                      className="flex items-center gap-1 px-2 py-1 bg-forge-bg/60 border border-forge-border rounded-md text-[11px]"
                    >
                      {att.mediaType?.startsWith('image/') ? <ImageIcon className="w-3 h-3 text-forge-text-dim" /> : <Paperclip className="w-3 h-3 text-forge-text-dim" />}
                      <span className="max-w-[120px] truncate text-forge-text-dim">{att.filename || 'file'}</span>
                      <button onClick={() => chat.handleRemoveAttachment(i)} className="p-0.5 text-forge-text-dim hover:text-red-500 transition-colors" aria-label="Remove attachment">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Textarea */}
            <textarea
              ref={chat.inputRef}
              value={chat.input}
              onChange={e => {
                chat.setInput(e.target.value)
                const textarea = e.target
                requestAnimationFrame(() => {
                  textarea.style.height = '0'
                  textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
                })
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chat.handleSend() }
              }}
              onFocus={() => {
                // Scroll input into view when mobile keyboard opens
                setTimeout(() => {
                  chat.inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
                }, 300)
              }}
              enterKeyHint="send"
              inputMode="text"
              placeholder={chat.isEmpty ? 'Describe what you want to build...' : 'Ask for changes, new features, fixes...'}
              rows={1}
              className="w-full bg-transparent px-3 py-3 text-[13.5px] text-forge-text placeholder:text-forge-text-dim/40 outline-none resize-none chat-textarea-smooth"
            />

            {/* Action bar */}
            <div className="flex items-center justify-between px-2 pb-2">
              <div className="flex items-center gap-0.5">
                {/* File attach */}
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) chat.handleAttachFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 sm:p-1.5 text-forge-text-dim hover:text-forge-text rounded-lg hover:bg-forge-bg/60 transition-colors"
                  title="Attach files"
                  aria-label="Attach files"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                {/* Voice input */}
                {voice.isSupported && (
                  <button
                    onClick={voice.toggle}
                    className={cn(
                      'p-2 sm:p-1.5 rounded-lg transition-all',
                      voice.isListening
                        ? 'bg-red-100 dark:bg-red-900/40 text-red-500 hover:bg-red-200 dark:hover:bg-red-800/60 animate-pulse'
                        : 'text-forge-text-dim hover:text-forge-text hover:bg-forge-bg/60',
                    )}
                    title={voice.isListening ? 'Stop recording' : 'Voice input'}
                    aria-label={voice.isListening ? 'Stop recording' : 'Voice input'}
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                )}

                {/* Model picker */}
                <div className="relative ml-1">
                  <button
                    onClick={() => chat.setShowModelPicker(prev => !prev)}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] text-forge-text-dim hover:text-forge-text rounded-lg hover:bg-forge-bg/60 transition-all"
                  >
                    {MODEL_OPTIONS.find(m => m.id === chat.selectedModel)?.label || 'Sonnet 4'}
                    <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                  <AnimatePresence>
                    {chat.showModelPicker && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => chat.setShowModelPicker(false)} />
                        <motion.div
                          initial={{ opacity: 0, y: 4, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 4, scale: 0.95 }}
                          transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                          className="absolute left-0 bottom-full mb-1 z-50 w-44 bg-forge-bg/95 backdrop-blur-lg border border-forge-border rounded-xl shadow-lg overflow-hidden"
                        >
                          {MODEL_OPTIONS.map((model, modelIdx) => (
                            <button
                              key={model.id}
                              onClick={() => { chat.setSelectedModel(model.id); chat.setShowModelPicker(false) }}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowDown') {
                                  e.preventDefault()
                                  const next = e.currentTarget.nextElementSibling as HTMLElement
                                  next?.focus()
                                } else if (e.key === 'ArrowUp') {
                                  e.preventDefault()
                                  const prev = e.currentTarget.previousElementSibling as HTMLElement
                                  prev?.focus()
                                } else if (e.key === 'Escape') {
                                  chat.setShowModelPicker(false)
                                }
                              }}
                              autoFocus={chat.selectedModel === model.id}
                              className={cn(
                                'flex items-center gap-2 w-full px-3 py-2 text-[12px] hover:bg-forge-surface-hover transition-colors focus:bg-forge-surface-hover outline-none',
                                chat.selectedModel === model.id && 'bg-forge-surface text-forge-text font-medium',
                              )}
                            >
                              <Check className={cn('w-3 h-3 shrink-0', chat.selectedModel === model.id ? 'text-forge-accent' : 'invisible')} />
                              <span className="flex-1 text-left">{model.label}</span>
                              <span className="text-[10px] text-forge-text-dim">{model.description}</span>
                            </button>
                          ))}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* Send / Stop */}
                <AnimatePresence mode="wait">
                {chat.isLoading ? (
                  <motion.button
                    key="stop"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    onClick={() => { chat.stoppedByUserRef.current = true; chat.stop() }}
                    className="p-2 sm:p-1.5 rounded-lg bg-red-100 dark:bg-red-900/40 text-forge-danger hover:bg-red-200 dark:hover:bg-red-800/60 transition-colors animate-stop-pulse stop-ring-pulse"
                    title="Stop generating (Esc)"
                    aria-label="Stop generating"
                  >
                    <StopCircle className="w-4 h-4" />
                  </motion.button>
                ) : (
                  <motion.button
                    key="send"
                    onClick={() => chat.handleSend()}
                    disabled={!chat.input.trim() && chat.attachments.length === 0}
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    className="p-2 sm:p-1.5 rounded-lg bg-forge-accent hover:bg-forge-accent-hover text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                    title="Send message"
                    aria-label="Send message"
                  >
                    <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
                  </motion.button>
                )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* Footer: metrics + clear */}
        <div className="flex items-center justify-between px-4 pb-2">
          <div className="flex items-center gap-1.5 tabular-nums">
            <AnimatePresence>
              {chat.autoRoutedModel && (
                <motion.span key="auto-route" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="text-[10px] text-forge-text-dim/60 flex items-center gap-0.5" title={chat.autoRoutedModel.reason}>
                  <Sparkles className="w-2.5 h-2.5" />
                  {chat.autoRoutedModel.model.includes('haiku') ? 'Haiku' : chat.autoRoutedModel.model.includes('opus') ? 'Opus' : 'Sonnet'}
                </motion.span>
              )}
              {chat.isLoading && chat.stepCount > 0 && (
                <motion.span key="step-count" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="text-[10px] text-forge-accent/60 font-medium tabular-nums">
                  {chat.stepCount} action{chat.stepCount !== 1 ? 's' : ''}
                </motion.span>
              )}
              {(() => {
                const sessionTotal = chat.sessionCost.inputTokens + chat.sessionCost.outputTokens
                const tokenCount = sessionTotal || chat.estimatedTokens
                const isReal = sessionTotal > 0
                if (tokenCount <= 0) return null
                return (
                  <motion.span key="tokens" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }} className="text-[10px] text-forge-text-dim/50" title={isReal ? `${chat.sessionCost.inputTokens.toLocaleString()} in + ${chat.sessionCost.outputTokens.toLocaleString()} out` : 'Estimated token usage'}>
                    {isReal ? '' : '~'}{tokenCount > 1000 ? `${(tokenCount / 1000).toFixed(1)}k` : tokenCount} tok
                  </motion.span>
                )
              })()}
              {chat.sessionCost.cost > 0 && !chat.isLoading && (
                <motion.span key="cost" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="text-[10px] text-forge-text-dim/50 cost-chip-enter" title={`Session: ${chat.sessionCost.inputTokens.toLocaleString()} in + ${chat.sessionCost.outputTokens.toLocaleString()} out`}>
                  ${chat.sessionCost.cost < 0.01 ? chat.sessionCost.cost.toFixed(4) : chat.sessionCost.cost.toFixed(2)}
                </motion.span>
              )}
              {chat.isLoading && chat.elapsed > 0 && (
                <motion.span key="elapsed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="text-[10px] text-forge-text-dim/50 flex items-center gap-0.5 tabular-nums">
                  <Clock className="w-2.5 h-2.5" />
                  {chat.formatElapsed(chat.elapsed)}
                </motion.span>
              )}
            </AnimatePresence>
            <span className="text-[10px] text-forge-text-dim/30 hidden sm:inline">
              Enter to send{chat.isLoading ? ' · Esc to stop' : ''}
            </span>
          </div>
          {chat.messages.length > 0 && (
            <button
              onClick={chat.handleClearChat}
              onMouseLeave={() => { if (chat.clearConfirm) { chat.setClearConfirm(false); if (chat.clearConfirmTimer.current) clearTimeout(chat.clearConfirmTimer.current) } }}
              className={cn(
                'p-1 rounded transition-colors text-[10px] flex items-center gap-0.5',
                chat.clearConfirm ? 'text-forge-danger' : 'text-forge-text-dim/40 hover:text-forge-danger',
              )}
              title={chat.clearConfirm ? 'Click again to confirm' : 'Clear chat'}
              aria-label={chat.clearConfirm ? 'Confirm clear chat' : 'Clear chat'}
            >
              <Trash2 className="w-3 h-3" />
              <AnimatePresence>
                {chat.clearConfirm && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden whitespace-nowrap"
                  >
                    Clear?
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          )}
        </div>
      </div>
    </div>
    </ErrorBoundary>
  )
})
