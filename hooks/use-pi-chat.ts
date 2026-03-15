'use client'

import { useState, useRef, useEffect, useCallback, useMemo, type RefObject } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { toast } from 'sonner'
import { getMessageText } from '@/lib/chat/tool-utils'
import { MODEL_OPTIONS } from '@/lib/chat/constants'
import { useChatMetrics } from './use-chat-metrics'
import { useAttachments } from './use-attachments'
import { useAutoScroll } from './use-auto-scroll'
import { useKeyboardShortcuts } from './use-keyboard-shortcuts'
import { useChatHistory } from './use-chat-history'
import { usePreviewEvents } from './use-preview-events'
import { useContextWarnings } from './use-context-warnings'
import { useFileChangeTracker } from './use-file-change-tracker'
import { useApprovalGate } from './use-approval-gate'
import { useToolProcessor } from './use-tool-processor'

/** Message part shape for compaction */
interface MessagePart {
  type: string
  text?: string
  toolName?: string
  toolCallId?: string
  state?: string
  input?: unknown
  args?: Record<string, unknown>
  output?: unknown
  result?: unknown
}


export interface UsePiChatProps {
  projectName: string
  projectId: string | null
  files: Record<string, string>
  onFileChange: (path: string, content: string) => void
  onFileDelete: (path: string) => void
  onBulkFileUpdate: (files: Record<string, string>) => void
  githubToken?: string
  onRegisterSend?: (sendFn: (message: string) => void) => void
  pendingMessage?: string | null
  onPendingMessageSent?: () => void
  activeFile?: string | null
  /** Brain identity — when set, system prompt uses Pi-Chi management personality */
  brainName?: string
  brainStatus?: string
}


export function usePiChat(props: UsePiChatProps) {
  const {
    projectName, projectId, files,
    onFileChange, onFileDelete, onBulkFileUpdate,
    onRegisterSend, pendingMessage, onPendingMessageSent, activeFile,
    brainName, brainStatus,
  } = props

  const [selectedModel, setSelectedModel] = useState<string>(MODEL_OPTIONS[0].id)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [envVars, setEnvVars] = useState<Record<string, string>>({})

  // Stable refs — synchronous reads inside transport callback
  const projectNameRef = useRef(projectName)
  const projectIdRef = useRef(projectId)
  const filesRef = useRef(files)
  const selectedModelRef = useRef(selectedModel)
  const envVarsRef = useRef(envVars)
  const activeFileRef = useRef(activeFile)
  const brainNameRef = useRef(brainName)
  const brainStatusRef = useRef(brainStatus)
  useEffect(() => { projectNameRef.current = projectName }, [projectName])
  useEffect(() => { projectIdRef.current = projectId }, [projectId])
  useEffect(() => { filesRef.current = files }, [files])
  useEffect(() => { selectedModelRef.current = selectedModel }, [selectedModel])
  useEffect(() => { envVarsRef.current = envVars }, [envVars])
  useEffect(() => { activeFileRef.current = activeFile }, [activeFile])
  useEffect(() => { brainNameRef.current = brainName }, [brainName])
  useEffect(() => { brainStatusRef.current = brainStatus }, [brainStatus])

  // Declared early — needed by onError for timeout detection
  const streamStartRef = useRef<number>(0)

  // Pre-flight message compaction — runs before sending to server
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function compactMessagesForSend(msgs: UIMessage[]): any[] {
    if (msgs.length <= 10) return msgs

    // Estimate body size: messages + files
    const filesPayload = filesRef.current
    const filesSize = Object.values(filesPayload).reduce((sum, v) => sum + v.length, 0)
    let msgsSize = 0
    for (const m of msgs) {
      const parts = m.parts as MessagePart[] | undefined
      if (Array.isArray(parts)) {
        for (const p of parts) {
          if (p.type === 'text') {
            msgsSize += (p.text?.length || 0)
          } else {
            // Tool parts include full file content in input/args — measure real size
            const input = (p.input || p.args) as Record<string, unknown> | undefined
            if (input && typeof input === 'object') {
              const content = input.content || input.old_string || input.new_string || ''
              msgsSize += 300 + (typeof content === 'string' ? content.length : 0)
            } else {
              msgsSize += 300
            }
          }
        }
      }
    }
    const estimatedBodyBytes = filesSize + msgsSize + 5000

    // Aggressive compaction if body would exceed ~3MB (Vercel limit is 4.5MB)
    // Also trigger if message content alone exceeds ~1.5MB (heavy tool results)
    if (estimatedBodyBytes > 3 * 1024 * 1024 || msgsSize > 1.5 * 1024 * 1024) {
      const first2 = msgs.slice(0, 2)
      const recent6 = msgs.slice(-6)
      const dropped = msgs.length - 8
      const summaryMsg = {
        id: `preflight-compact-${Date.now()}`,
        role: 'assistant' as const,
        content: '',
        parts: [{ type: 'text' as const, text: `[Pre-flight compaction: ${dropped} older messages removed to fit request size limit]` }],
      }
      console.log(`[pi:preflight] Compacted ${dropped} messages (body ~${(estimatedBodyBytes / 1024 / 1024).toFixed(1)}MB)`)
      return [...first2, summaryMsg, ...recent6]
    }

    // Strip tool invocation details from older messages to reduce token count
    if (msgs.length > 12) {
      return msgs.map((m: UIMessage, i: number) => {
        if (i >= msgs.length - 8) return m // keep recent 8 intact
        if (m.role !== 'assistant') return m
        const parts = m.parts as MessagePart[]
        if (!Array.isArray(parts)) return m
        const textParts = parts.filter((p: MessagePart) => p.type === 'text')
        const toolParts = parts.filter((p: MessagePart) => p.type !== 'text')
        if (toolParts.length === 0) return m
        const toolSummary = toolParts.map((p: MessagePart) => {
          const name = p.toolName || p.type?.replace(/^tool-/, '') || 'tool'
          const input = p.input as Record<string, unknown> | undefined
          const path = input?.path || p.args?.path || ''
          return path ? `${name}(${path})` : name
        }).join(', ')
        return {
          ...m,
          parts: [...textParts, { type: 'text', text: `\n[Tools: ${toolSummary}]` }],
        }
      })
    }

    return msgs
  }

  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    prepareSendMessagesRequest: ({ messages: msgs }) => ({
      body: {
        messages: compactMessagesForSend(msgs),
        projectName: projectNameRef.current,
        projectId: projectIdRef.current,
        files: filesRef.current,
        model: selectedModelRef.current,
        envVars: envVarsRef.current,
        activeFile: activeFileRef.current || undefined,
        activeFileContent: activeFileRef.current && filesRef.current[activeFileRef.current]
          ? filesRef.current[activeFileRef.current].split('\n').slice(0, 500).join('\n')
          : undefined,
        brainName: brainNameRef.current || undefined,
        brainStatus: brainStatusRef.current || undefined,
      },
    }),
  }), []) // eslint-disable-line react-hooks/exhaustive-deps

  const retryAfterCompactRef = useRef(false)
  const [pendingRetryText, setPendingRetryText] = useState<string | null>(null)
  const autoContinueRef = useRef(false) // tracks if an auto-continue is pending
  const autoContinueCountRef = useRef(0) // prevent infinite loops
  const MAX_AUTO_CONTINUES = 5

  const {
    messages,
    setMessages,
    stop,
    status,
    error,
    sendMessage,
    regenerate,
  } = useChat({
    transport,
    onError: (err) => {
      console.error('Chat error:', err)

      // If the stream died after 4+ minutes, it's the Vercel 300s timeout.
      // Auto-send a continuation so the AI picks up where it left off.
      const elapsedMs = Date.now() - (streamStartRef.current || 0)
      const isTimeout = elapsedMs > 240_000 || err.message?.includes('408') || err.message?.includes('timeout') || err.message?.includes('abort')

      if (isTimeout && !autoContinueRef.current && autoContinueCountRef.current < MAX_AUTO_CONTINUES) {
        autoContinueRef.current = true
        autoContinueCountRef.current++
        const continueNum = autoContinueCountRef.current
        toast.info(`Server timeout — auto-continuing (${continueNum}/${MAX_AUTO_CONTINUES})...`, { duration: 3000 })
        // Queue auto-continue after a brief delay
        setTimeout(() => {
          autoContinueRef.current = false
          sendMessage({
            text: `[AUTO-CONTINUE ${continueNum}/${MAX_AUTO_CONTINUES}] The previous response was cut short by a server timeout after ${Math.round(elapsedMs / 1000)}s. Continue exactly where you left off. Do NOT repeat work already done — check the file state and pick up from the next incomplete step.`,
          })
        }, 1500)
        return // skip other error handling
      }

      // Auto-compact and retry on 413 (context too long)
      if (!retryAfterCompactRef.current && (err.message?.includes('413') || err.message?.includes('too long') || err.message?.includes('context'))) {
        retryAfterCompactRef.current = true
        toast.info('Context too long — compacting and retrying...', { duration: 4000 })
        // Find the last user message for retry
        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
        const retryText = lastUserMsg ? getMessageText(lastUserMsg) : null
        // Trim older messages client-side as emergency compaction
        if (messages.length > 6) {
          const first2 = messages.slice(0, 2)
          const recent4 = messages.slice(-4)
          const dropped = messages.length - 6
          const summaryMsg = {
            id: `client-compact-${Date.now()}`,
            role: 'assistant' as const,
            content: '',
            parts: [{ type: 'text' as const, text: `[Conversation compacted — ${dropped} older messages removed to free context space]` }],
          }
          setMessages([...first2, summaryMsg as UIMessage, ...recent4])
          // Queue retry — effect below will pick it up after state settles
          if (retryText) {
            setPendingRetryText(retryText)
          } else {
            retryAfterCompactRef.current = false
          }
        } else {
          retryAfterCompactRef.current = false
        }
      }
    },
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  // After emergency compaction, resend the last user message
  useEffect(() => {
    if (pendingRetryText && !isLoading && retryAfterCompactRef.current) {
      const text = pendingRetryText
      setPendingRetryText(null)
      retryAfterCompactRef.current = false
      // Small delay to let React settle after setMessages
      const timer = setTimeout(() => {
        console.log('[pi:retry] Retrying after emergency compaction')
        sendMessage({ text })
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [pendingRetryText, isLoading, sendMessage]) // pendingRetryText state change triggers reliably

  const [input, setInput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [clearConfirm, setClearConfirm] = useState(false)
  const { attachments, setAttachments, handleAttachFiles, handleRemoveAttachment } = useAttachments(onFileChange)
  const [tasks, setTasks] = useState<Array<{ id: string; label: string; status: string; description?: string; blockedBy?: string[]; phase?: string }>>([])
  const taskDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestTasksRef = useRef<Array<{ id: string; label: string; status: string; description?: string; blockedBy?: string[]; phase?: string }>>([])

  // Extracted hooks — file change tracking, approval gates, tool processing
  const { lastChanges, pendingChangesRef, resetPendingChanges } = useFileChangeTracker(isLoading)

  // Extracted hooks
  const { messagesEndRef, showNewMessageIndicator, handleScroll, scrollToBottom } = useAutoScroll(messages, isLoading)
  const { stoppedByUserRef } = useKeyboardShortcuts(isLoading, stop)
  const { loadingHistory, loadOlderMessages, loadingOlder, hasOlderMessages } = useChatHistory(projectId, setMessages)
  usePreviewEvents(sendMessage)
  useContextWarnings(messages)

  const {
    pendingApproval, setPendingApproval,
    approvedKeys, deniedKeys,
    handleApprove, handleDeny,
  } = useApprovalGate(sendMessage)

  const clearConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { processedInvs } = useToolProcessor({
    messages, files, projectId,
    onBulkFileUpdate, onFileDelete,
    pendingChangesRef,
    pendingApproval, setPendingApproval,
    approvedKeys, deniedKeys,
    sendMessage,
    setTasks, latestTasksRef, taskDebounceRef,
  })

  const clearTasks = useCallback(() => {
    setTasks([])
    latestTasksRef.current = []
    if (taskDebounceRef.current) {
      clearTimeout(taskDebounceRef.current)
      taskDebounceRef.current = null
    }
  }, [])

  const handleSend = useCallback((text?: string) => {
    const content = (text || input).trim()
    if (!content && attachments.length === 0) return

    // Clear tasks from previous turn + reset auto-continue counter
    clearTasks()
    autoContinueCountRef.current = 0

    // Reset file change tracking for new turn
    resetPendingChanges()

    // Capture state before clearing
    const currentAttachments = [...attachments]
    setInput('')
    setAttachments([])
    if (inputRef.current) inputRef.current.style.height = 'auto'

    const doSend = () => {
      sendMessage({
        text: content || 'Process these files',
        files: currentAttachments.length > 0 ? currentAttachments : undefined,
      })
    }

    // If still loading (e.g. stop() hasn't fully propagated), force stop then send
    if (isLoading) {
      stop()
      setTimeout(doSend, 200)
    } else {
      doSend()
    }
  }, [input, isLoading, sendMessage, attachments, stop])

  const sendMessageRef = useRef(sendMessage)
  useEffect(() => { sendMessageRef.current = sendMessage }, [sendMessage])

  useEffect(() => {
    if (onRegisterSend) {
      onRegisterSend((message: string) => {
        sendMessageRef.current({ text: message })
      })
    }
  }, [onRegisterSend])

  useEffect(() => {
    if (pendingMessage && !isLoading) {
      sendMessage({ text: pendingMessage })
      onPendingMessageSent?.()
    }
  }, [pendingMessage, isLoading, sendMessage, onPendingMessageSent])

  const handleEnvVarsSave = useCallback((vars: Record<string, string>) => {
    setEnvVars(prev => ({ ...prev, ...vars }))
    const envContent = Object.entries(vars)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
    onFileChange('.env.local', envContent + '\n')
  }, [onFileChange])

  const handleCancelTask = useCallback(async (taskId: string) => {
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
    } catch {
      sendMessage({ text: `Cancel the running task with ID: ${taskId}` })
    }
  }, [sendMessage])

  const handleCopy = useCallback((id: string, content: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    toast.success('Copied', { duration: 1500 })
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  const handleEditMessage = useCallback((messageId: string, content: string) => {
    setEditingMessageId(messageId)
    setEditingContent(content)
  }, [])

  const handleSaveEdit = useCallback(() => {
    if (!editingMessageId || !editingContent.trim()) return
    const msgIndex = messages.findIndex(m => m.id === editingMessageId)
    if (msgIndex === -1) return
    const newMessages = messages.slice(0, msgIndex)
    setMessages(newMessages)
    processedInvs.current.clear()
    setEditingMessageId(null)
    queueMicrotask(() => sendMessage({ text: editingContent.trim() }))
  }, [editingMessageId, editingContent, messages, setMessages, sendMessage])

  const handleRegenerate = useCallback((messageId: string) => {
    const msgIndex = messages.findIndex(m => m.id === messageId)
    if (msgIndex <= 0) return
    const userMsg = messages[msgIndex - 1]
    if (userMsg.role !== 'user') return
    const userText = getMessageText(userMsg)
    const newMessages = messages.slice(0, msgIndex)
    setMessages(newMessages)
    processedInvs.current.clear()
    queueMicrotask(() => sendMessage({ text: userText }))
  }, [messages, setMessages, sendMessage])

  const handleClearChat = useCallback(() => {
    if (clearConfirm) {
      setMessages([])
      processedInvs.current.clear()
      setClearConfirm(false)
      if (clearConfirmTimer.current) clearTimeout(clearConfirmTimer.current)
    } else {
      setClearConfirm(true)
      clearConfirmTimer.current = setTimeout(() => setClearConfirm(false), 3000)
    }
  }, [clearConfirm, setMessages])

  const {
    stepCount, estimatedTokens, realTokens, autoRoutedModel,
    currentActivity, lastCompletedToolName, sessionCost, getMessageCost,
  } = useChatMetrics(messages)

  const [elapsed, setElapsed] = useState(0)
  const finalElapsedRef = useRef(0)

  useEffect(() => {
    if (isLoading) {
      streamStartRef.current = Date.now()
      setElapsed(0)
      const interval = setInterval(() => {
        const secs = Math.floor((Date.now() - streamStartRef.current) / 1000)
        setElapsed(secs)
        finalElapsedRef.current = secs
      }, 1000)
      return () => clearInterval(interval)
    }
    // Keep elapsed at final value briefly so completion signal can read it
  }, [isLoading])

  const formatElapsed = useCallback((s: number) => {
    if (s < 60) return `${s}s`
    return `${Math.floor(s / 60)}m ${s % 60}s`
  }, [])

  const isEmpty = messages.length === 0

  // ── Chat history search ──
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [highlightedResultIdx, setHighlightedResultIdx] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return [] as string[]
    const matchingIds: string[] = []
    for (const msg of messages) {
      const text = getMessageText(msg).toLowerCase()
      if (text.includes(q)) {
        matchingIds.push(msg.id)
      }
    }
    return matchingIds
  }, [searchQuery, messages])

  // Reset highlighted index when results change
  useEffect(() => {
    if (searchResults.length > 0) {
      setHighlightedResultIdx(0)
    }
  }, [searchResults])

  const nextSearchResult = useCallback(() => {
    if (searchResults.length === 0) return
    setHighlightedResultIdx(prev => (prev + 1) % searchResults.length)
  }, [searchResults.length])

  const prevSearchResult = useCallback(() => {
    if (searchResults.length === 0) return
    setHighlightedResultIdx(prev => (prev - 1 + searchResults.length) % searchResults.length)
  }, [searchResults.length])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
    setHighlightedResultIdx(0)
  }, [])

  const openSearch = useCallback(() => {
    setSearchOpen(true)
    // Focus the search input after React renders it
    requestAnimationFrame(() => {
      searchInputRef.current?.focus()
    })
  }, [])

  const errorMessage = error
    ? error.message?.includes('429') || error.message?.includes('rate limit') || error.message?.includes('overloaded')
      ? 'Claude is rate limited or overloaded. Wait a moment and retry.'
    : error.message?.includes('401')
      ? 'Session expired. Please sign in again.'
    : error.message?.includes('413') || error.message?.includes('context') || error.message?.includes('too long')
      ? 'Conversation is too long. Clear chat history or start a new project.'
    : error.message?.includes('408') || error.message?.includes('timeout')
      ? autoContinueCountRef.current > 0
        ? `Timeout — auto-continuing (${autoContinueCountRef.current}/${MAX_AUTO_CONTINUES})...`
        : 'Request timed out. Try a simpler prompt.'
    : error.message?.includes('fetch') || error.message?.includes('network')
      ? 'Connection lost. Check your internet and retry.'
    : error.message || 'Something went wrong. Please try again.'
    : null

  return {
    // Chat state
    messages, input, setInput, isLoading, status, error, errorMessage,
    // UI state
    selectedModel, setSelectedModel, showModelPicker, setShowModelPicker,
    copiedId, loadingHistory, loadOlderMessages, loadingOlder, hasOlderMessages,
    editingMessageId, editingContent,
    clearConfirm, envVars, elapsed, isEmpty, attachments,
    tasks, showNewMessageIndicator, scrollToBottom, lastChanges,
    stepCount, estimatedTokens, realTokens, autoRoutedModel, currentActivity, lastCompletedToolName,
    // Cost tracking
    sessionCost, getMessageCost,
    // Approval gates
    pendingApproval, handleApprove, handleDeny,
    // Refs
    messagesEndRef, inputRef, clearConfirmTimer, processedInvs,
    // Handlers
    handleSend, handleCopy, handleEditMessage, handleSaveEdit,
    handleRegenerate, handleEnvVarsSave, handleCancelTask, handleScroll,
    handleClearChat, handleAttachFiles, handleRemoveAttachment,
    setEditingMessageId, setEditingContent, setClearConfirm,
    stop, regenerate, setMessages, formatElapsed, stoppedByUserRef, clearTasks,
    // Chat history search
    searchQuery, setSearchQuery, searchResults, highlightedResultIdx,
    nextSearchResult, prevSearchResult, searchOpen, openSearch, closeSearch,
    searchInputRef: searchInputRef as RefObject<HTMLInputElement>,
  }
}
