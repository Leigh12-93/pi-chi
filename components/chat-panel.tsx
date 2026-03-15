'use client'

import { useState, useRef, useEffect, memo } from 'react'
import {
  Trash2,
  Sparkles,
  AlertTriangle, ChevronDown, Clock,
  X,
  Search, ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ErrorBoundary } from '@/components/error-boundary'
import { motion, AnimatePresence } from 'framer-motion'
import { QUICK_ACTIONS } from '@/lib/chat/constants'
import { MessageItem } from '@/components/chat/message-item'
import { ApprovalCard } from '@/components/approval-card'
import { ActivityBlock } from '@/components/chat/activity-block'
import { TaskListPanel } from '@/components/chat/task-list-panel'
import { ChangeSummary } from '@/components/chat/change-summary'
import { Composer } from '@/components/chat/composer'
import { usePiChat, type UsePiChatProps } from '@/hooks/use-pi-chat'
import { useVoiceInput } from '@/hooks/use-voice-input'
import { toast } from 'sonner'

export type ChatPanelProps = UsePiChatProps & {
  onLoadingChange?: (isLoading: boolean) => void
  onSessionCostChange?: (cost: { cost: number; inputTokens: number; outputTokens: number }) => void
  onFileSelect?: (path: string) => void
}

export const ChatPanel = memo(function ChatPanel({ onLoadingChange, onSessionCostChange, onFileSelect, ...props }: ChatPanelProps) {
  const chat = usePiChat(props)
  const [dismissedError, setDismissedError] = useState<string | null>(null)
  const [hintsDismissed, setHintsDismissed] = useState(() => {
    try { return localStorage.getItem('pi-hints-dismissed') === '1' } catch { return false }
  })

  const voice = useVoiceInput({
    onTranscript: (text) => {
      chat.setInput(prev => {
        const separator = prev.trim() ? ' ' : ''
        return prev + separator + text
      })
    },
    onError: (msg) => toast.error(msg),
  })

  // iOS keyboard handling - prevent viewport issues when keyboard opens
  useEffect(() => {
    if (typeof window !== 'undefined' && /iPhone|iPad/.test(navigator.userAgent)) {
      const handleResize = () => {
        const vh = window.innerHeight * 0.01
        document.documentElement.style.setProperty('--vh', `${vh}px`)
      }
      window.addEventListener('resize', handleResize)
      handleResize()
      return () => window.removeEventListener('resize', handleResize)
    }
  }, [])

  // Ctrl+F to open chat search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        if (chat.searchOpen) {
          chat.closeSearch()
        } else {
          chat.openSearch()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [chat.searchOpen, chat.openSearch, chat.closeSearch])

  // Auto-scroll to highlighted search result
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!chat.searchOpen || chat.searchResults.length === 0) return
    const targetId = chat.searchResults[chat.highlightedResultIdx]
    if (!targetId || !messagesContainerRef.current) return
    const el = messagesContainerRef.current.querySelector(`[data-message-id="${targetId}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [chat.searchOpen, chat.searchResults, chat.highlightedResultIdx])

  // Bubble loading state to parent (workspace auto-switching)
  useEffect(() => {
    onLoadingChange?.(chat.isLoading)
  }, [chat.isLoading, onLoadingChange])

  // Bubble session cost to parent (sidebar panel)
  useEffect(() => {
    onSessionCostChange?.(chat.sessionCost)
  }, [chat.sessionCost, onSessionCostChange])

  return (
    <ErrorBoundary>
    <div className="h-full flex flex-col bg-pi-bg">
      {/* Search bar */}
      <AnimatePresence>
        {chat.searchOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="shrink-0 bg-pi-surface border-b border-pi-border"
          >
            <div className="flex items-center gap-1.5 px-3 py-1.5">
              <Search className="w-3.5 h-3.5 text-pi-text-dim shrink-0" />
              <input
                ref={chat.searchInputRef}
                type="text"
                value={chat.searchQuery}
                onChange={(e) => chat.setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    chat.closeSearch()
                  } else if (e.key === 'Enter' && e.shiftKey) {
                    e.preventDefault()
                    chat.prevSearchResult()
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    chat.nextSearchResult()
                  }
                }}
                placeholder="Search messages..."
                className="flex-1 h-8 bg-transparent text-[13px] text-pi-text placeholder:text-pi-text-dim/40 outline-none border-none"
                aria-label="Search chat messages"
              />
              {chat.searchQuery && (
                <span className="text-[10px] text-pi-text-dim tabular-nums shrink-0">
                  {chat.searchResults.length > 0
                    ? `${chat.highlightedResultIdx + 1} of ${chat.searchResults.length}`
                    : 'No results'}
                </span>
              )}
              <button
                onClick={chat.prevSearchResult}
                disabled={chat.searchResults.length === 0}
                className="p-1 text-pi-text-dim hover:text-pi-text rounded disabled:opacity-30 transition-colors"
                aria-label="Previous result"
                title="Previous result (Shift+Enter)"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={chat.nextSearchResult}
                disabled={chat.searchResults.length === 0}
                className="p-1 text-pi-text-dim hover:text-pi-text rounded disabled:opacity-30 transition-colors"
                aria-label="Next result"
                title="Next result (Enter)"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={chat.closeSearch}
                className="p-1 text-pi-text-dim hover:text-pi-text rounded transition-colors"
                aria-label="Close search"
                title="Close search (Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto" onScroll={chat.handleScroll} role="log" aria-live="polite" aria-label="Chat messages">
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
                    i % 2 === 0 ? 'bg-pi-surface w-2/3' : 'bg-pi-surface w-3/4',
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
              <div className="w-14 h-14 rounded-2xl bg-pi-surface border border-pi-border flex items-center justify-center mb-5 animate-breathe">
                <Sparkles className="w-7 h-7 text-pi-accent/70" />
              </div>
              <h2 className="text-xl font-semibold text-pi-text mb-1.5 text-balance text-center tracking-tight">What shall we build?</h2>
              <p className="text-[13px] text-pi-text-dim text-center mb-8 text-pretty">Describe what you want to create, analyze, or improve</p>
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
                    className="flex flex-col items-center gap-2 p-4 text-center text-[12.5px] rounded-xl border border-pi-border bg-pi-bg hover:border-pi-accent/25 hover:bg-pi-surface/50 hover:shadow-sm transition-all group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-pi-surface border border-pi-border flex items-center justify-center group-hover:border-pi-accent/25 group-hover:shadow-sm group-hover:shadow-pi-accent/10 transition-all duration-200">
                      <action.icon className="w-4 h-4 text-pi-text-dim group-hover:text-pi-accent transition-colors" />
                    </div>
                    <span className="text-pi-text-dim group-hover:text-pi-text font-medium transition-colors">{action.label}</span>
                  </motion.button>
                ))}
              </div>

              {/* Example prompts — fill input on click */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.25 }}
                className="flex flex-col items-center gap-1.5 mt-5 w-full max-w-sm"
              >
                <span className="text-[10px] text-pi-text-dim/40 uppercase tracking-widest mb-1">or try</span>
                {[
                  'Build a todo app with drag-and-drop and local storage',
                  'Create a weather dashboard that fetches real API data',
                  'Make a blog with markdown support and dark mode',
                ].map((prompt, i) => (
                  <motion.button
                    key={prompt}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: 0.3 + i * 0.05 }}
                    onClick={() => chat.setInput(prompt)}
                    className="text-[11.5px] text-pi-text-dim/60 hover:text-pi-accent hover:bg-pi-surface/50 px-3 py-1.5 rounded-lg transition-all text-left w-full truncate"
                  >
                    &ldquo;{prompt}&rdquo;
                  </motion.button>
                ))}
              </motion.div>

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
                      className="text-[10px] text-pi-text-dim/50"
                    >
                      <kbd className="px-1.5 py-0.5 rounded bg-pi-surface border border-pi-border font-mono text-[9px]">{hint.key}</kbd>
                      {' '}{hint.label}
                    </motion.span>
                  ))}
                  <button
                    onClick={() => {
                      setHintsDismissed(true)
                      try { localStorage.setItem('pi-hints-dismissed', '1') } catch (e) { console.warn('[pi:localStorage] Failed to save hints preference:', e) }
                    }}
                    className="ml-1 p-0.5 text-pi-text-dim/30 hover:text-pi-text-dim transition-colors rounded"
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
            {chat.messages.map((message, idx) => {
              const isSearchMatch = chat.searchOpen && chat.searchResults.includes(message.id)
              const isActiveResult = isSearchMatch && chat.searchResults[chat.highlightedResultIdx] === message.id
              return (
              <div
                key={message.id}
                data-message-id={message.id}
                className={cn(
                  idx === chat.messages.length - 1 ? 'message-enter' : undefined,
                  isSearchMatch && !isActiveResult && 'ring-1 ring-pi-accent/30 rounded-xl',
                  isActiveResult && 'ring-2 ring-pi-accent/50 rounded-xl',
                )}
              >
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
                  onFileClick={onFileSelect}
                />
              </div>
              )
            })}

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

            {/* Streaming skeleton — shows while waiting for first AI token */}
            <AnimatePresence>
              {chat.isLoading && chat.status === 'submitted' && chat.messages.length > 0 && chat.messages[chat.messages.length - 1].role === 'user' && (
                <motion.div
                  key="streaming-skeleton"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="flex justify-start"
                >
                  <div className="rounded-2xl p-3.5 space-y-2.5 bg-pi-surface w-3/4 max-w-lg">
                    <div className="h-3 rounded animate-skeleton w-full" />
                    <div className="h-3 rounded animate-skeleton w-4/5" style={{ animationDelay: '80ms' }} />
                    <div className="h-3 rounded animate-skeleton w-3/5" style={{ animationDelay: '160ms' }} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Unified activity stream — thinking, working, completion */}
            <AnimatePresence>
              <ActivityBlock
                recentCompleted={chat.currentActivity?.recentCompleted || []}
                activeToolName={chat.currentActivity?.toolName || ''}
                activeToolArgs={chat.currentActivity?.args || {}}
                isLoading={chat.isLoading}
                elapsed={chat.elapsed}
                formatElapsed={chat.formatElapsed}
                stepCount={chat.stepCount}
                status={chat.status}
                tasks={chat.tasks}
                messageCost={(() => {
                  const lastAssistant = [...chat.messages].reverse().find(m => m.role === 'assistant')
                  return lastAssistant ? chat.getMessageCost(lastAssistant.id) : null
                })()}
              />
            </AnimatePresence>

            {/* File change summary — appears after AI finishes making file changes */}
            <AnimatePresence>
              {!chat.isLoading && chat.lastChanges && (
                <ChangeSummary
                  changes={chat.lastChanges}
                  onFileClick={(path) => {
                    // Dispatch event for workspace to open the file
                    window.dispatchEvent(new CustomEvent('pi:open-file', { detail: { path } }))
                  }}
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
              className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-pi-text bg-pi-surface/95 backdrop-blur-sm border border-pi-border rounded-full shadow-lg hover:bg-pi-surface-hover transition-colors"
            >
              <ChevronDown className="w-3 h-3" />
              {chat.isLoading ? 'New messages' : 'Scroll to bottom'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pinned task list — persistent above input */}
      <AnimatePresence>
        {chat.tasks.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="shrink-0 px-3 pb-1"
          >
            <TaskListPanel tasks={chat.tasks} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Composer — textarea, attachments, voice, model picker, send/stop, drag-drop */}
      <Composer
        input={chat.input}
        setInput={chat.setInput}
        isLoading={chat.isLoading}
        isEmpty={chat.isEmpty}
        onSend={chat.handleSend}
        onStop={chat.stop}
        stoppedByUserRef={chat.stoppedByUserRef}
        inputRef={chat.inputRef}
        attachments={chat.attachments}
        onAttachFiles={chat.handleAttachFiles}
        onRemoveAttachment={chat.handleRemoveAttachment}
        voice={voice}
        selectedModel={chat.selectedModel}
        setSelectedModel={chat.setSelectedModel}
        showModelPicker={chat.showModelPicker}
        setShowModelPicker={chat.setShowModelPicker}
      />

      {/* Footer: metrics + clear */}
      <div className="shrink-0">
        <div className="flex items-center justify-between px-4 pb-2">
          <div className="flex items-center gap-1.5 tabular-nums">
            <AnimatePresence>
              {chat.autoRoutedModel && (
                <motion.span key="auto-route" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="text-[10px] text-pi-text-dim/60 flex items-center gap-0.5" title={chat.autoRoutedModel.reason}>
                  <Sparkles className="w-2.5 h-2.5" />
                  {chat.autoRoutedModel.model.includes('haiku') ? 'Haiku' : chat.autoRoutedModel.model.includes('opus') ? 'Opus' : 'Sonnet'}
                </motion.span>
              )}
              {chat.isLoading && chat.stepCount > 0 && (
                <motion.span key="step-count" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="text-[10px] text-pi-accent/60 font-medium tabular-nums">
                  {chat.stepCount} action{chat.stepCount !== 1 ? 's' : ''}
                </motion.span>
              )}
              {(() => {
                const sessionTotal = chat.sessionCost.inputTokens + chat.sessionCost.outputTokens
                const tokenCount = sessionTotal || chat.estimatedTokens
                const isReal = sessionTotal > 0
                if (tokenCount <= 0) return null
                return (
                  <motion.span key="tokens" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }} className="text-[10px] text-pi-text-dim/50" title={isReal ? `${chat.sessionCost.inputTokens.toLocaleString()} in + ${chat.sessionCost.outputTokens.toLocaleString()} out` : 'Estimated token usage'}>
                    {isReal ? '' : '~'}{tokenCount > 1000 ? `${(tokenCount / 1000).toFixed(1)}k` : tokenCount} tok
                  </motion.span>
                )
              })()}
              {chat.sessionCost.cost > 0 && !chat.isLoading && (
                <motion.span key="cost" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="text-[10px] text-pi-text-dim/50 cost-chip-enter" title={`Session: ${chat.sessionCost.inputTokens.toLocaleString()} in + ${chat.sessionCost.outputTokens.toLocaleString()} out`}>
                  ${chat.sessionCost.cost < 0.01 ? chat.sessionCost.cost.toFixed(4) : chat.sessionCost.cost.toFixed(2)}
                </motion.span>
              )}
              {chat.isLoading && chat.elapsed > 0 && (
                <motion.span key="elapsed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="text-[10px] text-pi-text-dim/50 flex items-center gap-0.5 tabular-nums">
                  <Clock className="w-2.5 h-2.5" />
                  {chat.formatElapsed(chat.elapsed)}
                </motion.span>
              )}
            </AnimatePresence>
            <span className="text-[10px] text-pi-text-dim/30 hidden sm:inline">
              Enter to send{chat.isLoading ? ' · Esc to stop' : ''}
            </span>
          </div>
          {chat.messages.length > 0 && (
            <button
              onClick={chat.handleClearChat}
              onMouseLeave={() => { if (chat.clearConfirm) { chat.setClearConfirm(false); if (chat.clearConfirmTimer.current) clearTimeout(chat.clearConfirmTimer.current) } }}
              className={cn(
                'p-1 rounded transition-colors text-[10px] flex items-center gap-0.5',
                chat.clearConfirm ? 'text-pi-danger' : 'text-pi-text-dim/40 hover:text-pi-danger',
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
