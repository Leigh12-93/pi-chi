'use client'

import { useState, useRef, type RefObject } from 'react'
import {
  Check, Paperclip, ImageIcon, X, Mic,
  ArrowUp, StopCircle, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { MODEL_OPTIONS } from '@/lib/chat/constants'

/* ─── Types ──────────────────────────────────────── */

interface Attachment {
  filename?: string
  mediaType?: string
  [key: string]: unknown
}

interface VoiceInput {
  isSupported: boolean
  isListening: boolean
  interimText: string
  toggle: () => void
}

export interface ComposerProps {
  /** Current input text */
  input: string
  /** Update input text */
  setInput: (val: string | ((prev: string) => string)) => void
  /** Whether the chat is currently loading/streaming */
  isLoading: boolean
  /** Whether the chat is empty (no messages yet) */
  isEmpty: boolean
  /** Send a message */
  onSend: (text?: string) => void
  /** Stop generating */
  onStop: () => void
  /** Ref for the stopped-by-user flag */
  stoppedByUserRef: RefObject<boolean>
  /** Input textarea ref */
  inputRef: RefObject<HTMLTextAreaElement | null>
  /** Attachments */
  attachments: Attachment[]
  /** Handle file attachment */
  onAttachFiles: (files: FileList) => Promise<void>
  /** Remove attachment by index */
  onRemoveAttachment: (index: number) => void
  /** Voice input state */
  voice: VoiceInput
  /** Selected model ID */
  selectedModel: string
  /** Update selected model */
  setSelectedModel: (id: string) => void
  /** Whether model picker is open */
  showModelPicker: boolean
  /** Toggle model picker */
  setShowModelPicker: (val: boolean | ((prev: boolean) => boolean)) => void
}

/* ─── Component ──────────────────────────────────── */

export function Composer({
  input, setInput, isLoading, isEmpty,
  onSend, onStop, stoppedByUserRef, inputRef,
  attachments, onAttachFiles, onRemoveAttachment,
  voice, selectedModel, setSelectedModel,
  showModelPicker, setShowModelPicker,
}: ComposerProps) {
  const [isDragging, setIsDragging] = useState(false)
  const composerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="shrink-0 safe-bottom">
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
              <div className="px-4 pt-2 text-[12px] text-pi-text-dim/60 italic truncate">
                {voice.interimText}...
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Composer body */}
      <div
        ref={composerRef}
        className="p-3 transition-transform duration-200 ease-out"
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={async (e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragging(false)
          if (e.dataTransfer.files.length > 0) {
            await onAttachFiles(e.dataTransfer.files)
          }
        }}
      >
        <div className="relative bg-pi-surface border border-pi-border rounded-xl shadow-[inset_0_1px_2px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] composer-focus-glow transition-all">
          {/* Drag overlay */}
          <AnimatePresence>
            {isDragging && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 z-10 rounded-xl border-2 border-dashed border-pi-accent bg-pi-accent/10 flex items-center justify-center pointer-events-none"
              >
                <span className="text-[12px] font-medium text-pi-accent">Drop files here</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Attachment chips */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
              <AnimatePresence mode="popLayout">
                {attachments.map((att, i) => (
                  <motion.div
                    key={att.filename || i}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                    className="flex items-center gap-1 px-2 py-1 bg-pi-bg/60 border border-pi-border rounded-md text-[11px]"
                  >
                    {att.mediaType?.startsWith('image/') ? <ImageIcon className="w-3 h-3 text-pi-text-dim" /> : <Paperclip className="w-3 h-3 text-pi-text-dim" />}
                    <span className="max-w-[120px] truncate text-pi-text-dim">{att.filename || 'file'}</span>
                    <button onClick={() => onRemoveAttachment(i)} className="p-0.5 text-pi-text-dim hover:text-red-500 transition-colors" aria-label="Remove attachment">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Textarea */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => {
              setInput(e.target.value)
              const textarea = e.target
              requestAnimationFrame(() => {
                textarea.style.height = '0'
                textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
              })
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() }
            }}
            onFocus={() => {
              // Scroll input into view when mobile keyboard opens
              setTimeout(() => {
                inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
              }, 300)
            }}
            enterKeyHint="send"
            inputMode="text"
            placeholder={isEmpty ? 'Describe what you want to build...' : 'Ask for changes, new features, fixes...'}
            aria-label="Message input"
            rows={1}
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full bg-transparent px-3 py-3 text-base sm:text-[13.5px] text-pi-text placeholder:text-pi-text-dim/40 outline-none border-none shadow-none focus:shadow-none focus-visible:shadow-none resize-none chat-textarea-smooth"
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
                  if (e.target.files) onAttachFiles(e.target.files)
                  e.target.value = ''
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 sm:p-1.5 text-pi-text-dim hover:text-pi-text rounded-lg hover:bg-pi-bg/60 transition-colors"
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
                      : 'text-pi-text-dim hover:text-pi-text hover:bg-pi-bg/60',
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
                  onClick={() => setShowModelPicker(prev => !prev)}
                  aria-label="Select AI model"
                  aria-haspopup="listbox"
                  aria-expanded={showModelPicker}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] text-pi-text-dim hover:text-pi-text rounded-lg hover:bg-pi-bg/60 transition-all"
                >
                  {MODEL_OPTIONS.find(m => m.id === selectedModel)?.label || 'Sonnet 4'}
                  <ChevronDown className="w-2.5 h-2.5" />
                </button>
                <AnimatePresence>
                  {showModelPicker && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowModelPicker(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: 4, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.95 }}
                        transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                        className="absolute left-0 bottom-full mb-1 z-50 w-44 bg-pi-bg/95 backdrop-blur-lg border border-pi-border rounded-xl shadow-lg overflow-hidden"
                        role="listbox"
                        aria-label="AI model options"
                      >
                        {MODEL_OPTIONS.map((model) => (
                          <button
                            key={model.id}
                            onClick={() => { setSelectedModel(model.id); setShowModelPicker(false) }}
                            role="option"
                            aria-selected={selectedModel === model.id}
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
                                setShowModelPicker(false)
                              }
                            }}
                            autoFocus={selectedModel === model.id}
                            className={cn(
                              'flex items-center gap-2 w-full px-3 py-2 text-[12px] hover:bg-pi-surface-hover transition-colors focus:bg-pi-surface-hover outline-none',
                              selectedModel === model.id && 'bg-pi-surface text-pi-text font-medium',
                            )}
                          >
                            <Check className={cn('w-3 h-3 shrink-0', selectedModel === model.id ? 'text-pi-accent' : 'invisible')} />
                            <span className="flex-1 text-left">{model.label}</span>
                            <span className="text-[10px] text-pi-text-dim">{model.description}</span>
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
              {isLoading ? (
                <motion.button
                  key="stop"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  onClick={() => { stoppedByUserRef.current = true; onStop() }}
                  className="p-2 sm:p-1.5 rounded-lg bg-red-100 dark:bg-red-900/40 text-pi-danger hover:bg-red-200 dark:hover:bg-red-800/60 transition-colors animate-stop-pulse stop-ring-pulse"
                  title="Stop generating (Esc)"
                  aria-label="Stop generating"
                >
                  <StopCircle className="w-4 h-4" />
                </motion.button>
              ) : (
                <motion.button
                  key="send"
                  onClick={() => onSend()}
                  disabled={!input.trim() && attachments.length === 0}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="p-2 sm:p-1.5 rounded-lg bg-pi-accent hover:bg-pi-accent-hover text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-pi-ring transition-opacity"
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
    </div>
  )
}
