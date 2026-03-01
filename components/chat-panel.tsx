'use client'

import { useState, useRef } from 'react'
import {
  Loader2, Check, Trash2,
  Sparkles, ArrowUp, StopCircle,
  AlertTriangle, ChevronDown, Clock,
  Globe, FileText, FolderPlus,
  Paperclip, ImageIcon, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ErrorBoundary } from '@/components/error-boundary'
import { motion } from 'framer-motion'
import { MODEL_OPTIONS, QUICK_ACTIONS } from '@/lib/chat/constants'
import { MessageItem } from '@/components/chat/message-item'
import { useForgeChat, type UseForgeChatProps } from '@/hooks/use-forge-chat'

export type ChatPanelProps = UseForgeChatProps

export function ChatPanel(props: ChatPanelProps) {
  const chat = useForgeChat(props)
  const [isDraggingChat, setIsDraggingChat] = useState(false)
  const [dismissedError, setDismissedError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <ErrorBoundary>
    <div className="h-full flex flex-col bg-forge-bg">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto" onScroll={chat.handleScroll} role="log" aria-live="polite" aria-label="Chat messages">
        {chat.loadingHistory ? (
          <div className="px-4 py-6 space-y-4 animate-fade-in">
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
          </div>
        ) : chat.isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full px-6">
            <div className="w-14 h-14 rounded-2xl bg-forge-surface border border-forge-border flex items-center justify-center mb-5 animate-breathe">
              <Sparkles className="w-7 h-7 text-forge-accent/70" />
            </div>
            <h2 className="text-xl font-semibold text-forge-text mb-1.5 text-balance text-center tracking-tight">What shall we build?</h2>
            <p className="text-[13px] text-forge-text-dim text-center mb-8 text-pretty">Describe your idea and Forge will build it</p>
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
                  <div className="w-9 h-9 rounded-xl bg-forge-surface border border-forge-border flex items-center justify-center group-hover:border-forge-accent/25 transition-colors">
                    <action.icon className="w-4 h-4 text-forge-text-dim group-hover:text-forge-accent transition-colors" />
                  </div>
                  <span className="text-forge-text-dim group-hover:text-forge-text font-medium transition-colors">{action.label}</span>
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-4 py-4 space-y-4">
            {chat.messages.map((message, idx) => (
              <MessageItem
                key={message.id}
                message={message}
                copiedId={chat.copiedId}
                isEditing={chat.editingMessageId === message.id}
                editingContent={chat.editingContent}
                isLoading={chat.isLoading}
                isLast={idx === chat.messages.length - 1}
                envVars={chat.envVars}
                onCopy={chat.handleCopy}
                onEditMessage={chat.handleEditMessage}
                onSaveEdit={chat.handleSaveEdit}
                onCancelEdit={() => chat.setEditingMessageId(null)}
                onSetEditingContent={chat.setEditingContent}
                onRegenerate={chat.handleRegenerate}
                onEnvVarsSave={chat.handleEnvVarsSave}
                onCancelTask={chat.handleCancelTask}
              />
            ))}

            {/* Streaming indicator */}
            {chat.isLoading && (
              <div className="flex items-center gap-2 py-2 px-1 animate-fade-in">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-forge-surface/80 border border-forge-border rounded-full">
                  <span className="flex items-center gap-0.5">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </span>
                  <span className="text-[12px] text-forge-text-dim">
                    {chat.stepCount > 0 ? `Step ${chat.stepCount}` : 'Thinking'}
                  </span>
                  {chat.elapsed > 0 && (
                    <span className="text-[10px] text-forge-text-dim/50 font-mono">
                      {chat.formatElapsed(chat.elapsed)}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Error banner */}
            {chat.error && dismissedError !== chat.errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
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

            <div ref={chat.messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-forge-border p-3 shrink-0 safe-bottom">
        <div
          className="relative"
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
          {/* Drag overlay */}
          {isDraggingChat && (
            <div className="absolute inset-0 z-10 rounded-2xl border-2 border-dashed border-forge-accent bg-forge-accent/10 flex items-center justify-center pointer-events-none">
              <span className="text-xs font-medium text-forge-accent">Drop files here</span>
            </div>
          )}

          {/* Attachment chips */}
          {chat.attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-2 pb-1">
              {chat.attachments.map((att, i) => (
                <div key={i} className="flex items-center gap-1 px-2 py-1 bg-forge-surface border border-forge-border rounded-lg text-[11px]">
                  {att.mediaType?.startsWith('image/') ? <ImageIcon className="w-3 h-3" /> : <Paperclip className="w-3 h-3" />}
                  <span className="max-w-[120px] truncate text-forge-text-dim">{att.filename || 'file'}</span>
                  <button onClick={() => chat.handleRemoveAttachment(i)} className="p-0.5 text-forge-text-dim hover:text-red-500 transition-colors" aria-label="Remove attachment">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={chat.inputRef}
            value={chat.input}
            onChange={e => {
              chat.setInput(e.target.value)
              const textarea = e.target
              requestAnimationFrame(() => {
                textarea.style.height = 'auto'
                textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
              })
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chat.handleSend() }
            }}
            placeholder={chat.isEmpty ? 'Describe what you want to build...' : 'Ask for changes, new features, fixes...'}
            rows={1}
            className="w-full bg-forge-surface border border-forge-border rounded-2xl pl-10 pr-12 py-3 text-[13.5px] text-forge-text placeholder:text-forge-text-dim/40 outline-none focus:border-forge-accent/40 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] focus:shadow-[inset_0_1px_2px_rgba(0,0,0,0.04),0_0_0_3px_var(--color-forge-ring)] resize-none transition-all"
          />

          {/* Paperclip file picker button */}
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
            className="absolute left-2.5 bottom-2.5 p-1.5 text-forge-text-dim hover:text-forge-text transition-colors rounded-lg hover:bg-forge-surface-hover"
            title="Attach files"
            aria-label="Attach files"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <div className="absolute right-2 bottom-1.5">
            {chat.isLoading ? (
              <button onClick={chat.stop} className="p-2 rounded-xl bg-red-100 dark:bg-red-900/40 text-forge-danger hover:bg-red-200 dark:hover:bg-red-800/60 transition-colors animate-stop-pulse" title="Stop generating (Esc)" aria-label="Stop generating">
                <StopCircle className="w-4 h-4" />
              </button>
            ) : (
              <motion.button
                onClick={() => chat.handleSend()}
                disabled={!chat.input.trim() && chat.attachments.length === 0}
                initial={{ scale: 0.9, opacity: 0.5 }}
                animate={{
                  scale: (chat.input.trim() || chat.attachments.length > 0) ? 1 : 0.9,
                  opacity: (chat.input.trim() || chat.attachments.length > 0) ? 1 : 0.5,
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                className="p-2 rounded-xl bg-gradient-to-b from-forge-accent to-indigo-600 dark:from-forge-accent dark:to-indigo-500 text-white shadow-sm hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                title="Send message"
                aria-label="Send message"
              >
                <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
              </motion.button>
            )}
          </div>
        </div>
        {/* Footer: model picker + hints + clear + tokens */}
        <div className="flex items-center justify-between mt-2 px-1">
          <div className="flex items-center gap-2">
            {/* Model picker chip */}
            <div className="relative">
              <button
                onClick={() => chat.setShowModelPicker(prev => !prev)}
                className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-forge-text-dim hover:text-forge-text bg-forge-surface border border-forge-border rounded-lg hover:border-forge-text-dim/30 transition-all"
              >
                {MODEL_OPTIONS.find(m => m.id === chat.selectedModel)?.label || 'Sonnet 4'}
                <ChevronDown className="w-2.5 h-2.5" />
              </button>
              {chat.showModelPicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => chat.setShowModelPicker(false)} />
                  <div className="absolute left-0 bottom-full mb-1 z-50 w-44 bg-forge-bg/95 backdrop-blur-lg border border-forge-border rounded-xl shadow-lg overflow-hidden animate-slide-down">
                    {MODEL_OPTIONS.map(model => (
                      <button
                        key={model.id}
                        onClick={() => { chat.setSelectedModel(model.id); chat.setShowModelPicker(false) }}
                        className={cn(
                          'flex items-center gap-2 w-full px-3 py-2 text-[12px] hover:bg-forge-surface-hover transition-colors',
                          chat.selectedModel === model.id && 'bg-forge-surface text-forge-text font-medium',
                        )}
                      >
                        <Check className={cn('w-3 h-3 shrink-0', chat.selectedModel === model.id ? 'text-forge-accent' : 'invisible')} />
                        <span className="flex-1 text-left">{model.label}</span>
                        <span className="text-[10px] text-forge-text-dim">{model.description}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <span className="text-[10px] text-forge-text-dim/40 hidden sm:inline">
              Enter to send{chat.isLoading ? ' · Esc to stop' : ''}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {(chat.autoRoutedModel || (chat.realTokens || chat.estimatedTokens) > 0 || (chat.isLoading && chat.elapsed > 0)) && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-forge-surface/50 rounded-lg">
                {chat.autoRoutedModel && (
                  <span className="text-[10px] text-forge-text-dim/60 flex items-center gap-0.5" title={chat.autoRoutedModel.reason}>
                    <Sparkles className="w-2.5 h-2.5" />
                    {chat.autoRoutedModel.model.includes('haiku') ? 'Haiku' : chat.autoRoutedModel.model.includes('opus') ? 'Opus' : 'Sonnet'}
                  </span>
                )}
                {(chat.realTokens || chat.estimatedTokens) > 0 && (
                  <span className="text-[10px] text-forge-text-dim/50" title={chat.realTokens ? 'Actual API token usage' : 'Estimated token usage'}>
                    {chat.realTokens ? '' : '~'}{(chat.realTokens || chat.estimatedTokens) > 1000 ? `${((chat.realTokens || chat.estimatedTokens) / 1000).toFixed(1)}k` : (chat.realTokens || chat.estimatedTokens)} tokens
                  </span>
                )}
                {chat.isLoading && chat.elapsed > 0 && (
                  <span className="text-[10px] text-forge-text-dim/50 flex items-center gap-0.5">
                    <Clock className="w-2.5 h-2.5" />
                    {chat.formatElapsed(chat.elapsed)}
                  </span>
                )}
              </div>
            )}
            {chat.messages.length > 0 && (
              <button
                onClick={chat.handleClearChat}
                onMouseLeave={() => { if (chat.clearConfirm) { chat.setClearConfirm(false); if (chat.clearConfirmTimer.current) clearTimeout(chat.clearConfirmTimer.current) } }}
                className={`p-1 transition-colors rounded text-[10px] flex items-center gap-0.5 ${chat.clearConfirm ? 'text-forge-danger' : 'text-forge-text-dim/40 hover:text-forge-danger'}`}
                title={chat.clearConfirm ? 'Click again to confirm' : 'Clear chat'}
                aria-label={chat.clearConfirm ? 'Confirm clear chat' : 'Clear chat'}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {chat.clearConfirm && <span>Clear?</span>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
    </ErrorBoundary>
  )
}
