'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { toast } from 'sonner'
import { extractFileUpdates, type ToolInvocation } from '@/lib/chat/tool-utils'
import { clearMarkdownCache } from '@/lib/chat/markdown'
import { MODEL_OPTIONS } from '@/lib/chat/constants'

export interface UseForgeChatProps {
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
}

/** Extract text content from a v6 UIMessage */
function getMessageText(message: any): string {
  // v6 parts-based format
  if (Array.isArray(message.parts)) {
    return message.parts
      .filter((p: any) => p.type === 'text')
      .map((p: any) => p.text || '')
      .join('')
  }
  // Legacy v4 format fallback
  if (typeof message.content === 'string') return message.content
  return ''
}

export function useForgeChat(props: UseForgeChatProps) {
  const {
    projectName, projectId, files,
    onFileChange, onFileDelete, onBulkFileUpdate,
    onRegisterSend, pendingMessage, onPendingMessageSent, activeFile,
  } = props

  // ─── Model & env ──────────────────────────────────────────────
  const [selectedModel, setSelectedModel] = useState<string>(MODEL_OPTIONS[0].id)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [envVars, setEnvVars] = useState<Record<string, string>>({})

  // ─── useChat (AI SDK v6) ──────────────────────────────────────
  // v6 uses transport instead of api, sendMessage instead of append,
  // status instead of isLoading, and parts-based messages
  const {
    messages,
    setMessages,
    stop,
    status,
    error,
    sendMessage,
    reload,
  } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      // v6: prepareSendMessagesRequest for dynamic body data
      prepareSendMessagesRequest: ({ messages: msgs }) => ({
        body: {
          messages: msgs,
          projectName,
          projectId,
          files,
          model: selectedModel,
          envVars,
          activeFile: activeFile || undefined,
          activeFileContent: activeFile && files[activeFile]
            ? files[activeFile].split('\n').slice(0, 500).join('\n')
            : undefined,
        },
      }),
    }),
    onError: (err) => console.error('Chat error:', err),
  })

  // Derive isLoading from status (v6 pattern)
  const isLoading = status === 'streaming' || status === 'submitted'

  // ─── UI state ─────────────────────────────────────────────────
  const [input, setInput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [clearConfirm, setClearConfirm] = useState(false)

  // ─── Refs ─────────────────────────────────────────────────────
  const clearConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const processedInvs = useRef(new Set<string>())
  const historyLoadingRef = useRef(false)
  const localFiles = useRef<Record<string, string>>({})
  const isNearBottomRef = useRef(true)

  // ─── Sync files ref ───────────────────────────────────────────
  useEffect(() => {
    localFiles.current = { ...files }
  }, [files])

  // Clear markdown cache when switching projects
  useEffect(() => {
    clearMarkdownCache()
  }, [projectId])

  // ─── Scroll tracking ─────────────────────────────────────────
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150
  }, [])

  // Escape to stop generation
  useEffect(() => {
    if (!isLoading) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); stop() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isLoading, stop])

  // Auto-scroll when near bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
    }
  }, [messages, isLoading])

  // ─── Load chat history ────────────────────────────────────────
  useEffect(() => {
    if (!projectId || historyLoaded) return
    if (historyLoadingRef.current) return
    historyLoadingRef.current = true
    setHistoryLoaded(true)
    setLoadingHistory(true)

    try {
      fetch(`/api/projects/${projectId}/messages`)
        .then(res => res.json())
        .then(data => {
          if (data.messages?.length > 0) {
            // Convert persisted messages to v6 UIMessage format
            const loaded = data.messages.map((msg: any) => ({
              id: msg.id,
              role: msg.role,
              parts: [{ type: 'text', text: msg.content || '' }],
              // Keep legacy content for backward compat with message-item
              content: msg.content || '',
            }))
            setMessages(loaded)
          }
        })
        .catch((err) => {
          console.warn('Failed to load chat history:', err)
          toast.error('Could not load chat history', { description: 'Previous messages may be missing.', duration: 4000 })
        })
        .finally(() => {
          setLoadingHistory(false)
          historyLoadingRef.current = false
        })
    } catch {
      historyLoadingRef.current = false
    }
  }, [projectId, historyLoaded, setMessages])

  // ─── Live file extraction from tool invocations ───────────────
  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue

      // v6: tool invocations are in message.parts as tool-invocation parts
      const parts = (msg as any).parts as Array<{ type: string; text?: string; toolInvocation?: ToolInvocation; toolName?: string; state?: string; input?: any; output?: any }> | undefined
      
      // Extract tool invocations from parts (support both v6 tool-* format and legacy toolInvocation)
      const invocations: ToolInvocation[] = []
      if (parts) {
        for (const p of parts) {
          // v6 format: part.type starts with 'tool-' and has toolName, state, input, output
          if (p.type?.startsWith('tool-') && p.type !== 'tool-invocation' && p.toolName) {
            invocations.push({
              toolName: p.toolName,
              state: p.state || 'result',
              args: p.input || {},
              result: p.output,
            })
          }
          // Legacy format from v4
          if (p.type === 'tool-invocation' && p.toolInvocation) {
            invocations.push(p.toolInvocation)
          }
        }
      }
      // Also check legacy toolInvocations array
      const legacyInvs = (msg as any).toolInvocations as ToolInvocation[] | undefined
      if (legacyInvs) {
        for (const inv of legacyInvs) {
          invocations.push(inv)
        }
      }

      for (let i = 0; i < invocations.length; i++) {
        const inv = invocations[i]
        const key = `${msg.id}:${inv.toolName}:${i}`

        if (processedInvs.current.has(key)) continue

        const processAtCall = ['write_file', 'delete_file'].includes(inv.toolName)
        const processAtResult = ['edit_file', 'create_project', 'rename_file'].includes(inv.toolName)

        // v6 states: 'input-streaming', 'input-available', 'output-available', 'output-error'
        const isResult = inv.state === 'result' || inv.state === 'output-available'
        const isCall = inv.state === 'call' || inv.state === 'input-available'

        const shouldProcess =
          (processAtCall && (isCall || isResult)) ||
          (processAtResult && isResult)

        if (!shouldProcess) continue

        if (isResult && inv.result && typeof inv.result === 'object' && 'error' in inv.result) {
          processedInvs.current.add(key)
          continue
        }

        const changes = extractFileUpdates(inv, localFiles.current)
        if (!changes) continue

        processedInvs.current.add(key)

        if (changes.updates && Object.keys(changes.updates).length > 0) {
          for (const [path, content] of Object.entries(changes.updates)) {
            localFiles.current[path] = content
          }
          onBulkFileUpdate(changes.updates)
        }
        if (changes.deletes) {
          for (const path of changes.deletes) {
            delete localFiles.current[path]
            onFileDelete(path)
          }
        }
      }
    }
  }, [messages, onBulkFileUpdate, onFileDelete]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Send / register / pending ────────────────────────────────
  const handleSend = useCallback((text?: string) => {
    const content = (text || input).trim()
    if (!content || isLoading) return
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    // v6: sendMessage takes { text } instead of { role, content }
    sendMessage({ text: content })
  }, [input, isLoading, sendMessage])

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

  // ─── Callbacks ────────────────────────────────────────────────
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

  // ─── Computed values ──────────────────────────────────────────
  const { stepCount, estimatedTokens } = useMemo(() => {
    let steps = 0
    let tokens = 0
    for (const msg of messages) {
      const textLen = getMessageText(msg).length
      tokens += Math.ceil(textLen / 4)
      if (msg.role !== 'assistant') continue
      const parts = (msg as any).parts as Array<{ type: string }> | undefined
      if (parts) {
        steps += parts.filter(p => p.type === 'tool-invocation' || p.type?.startsWith('tool-')).length
      }
      const invs = (msg as any).toolInvocations as ToolInvocation[] | undefined
      if (invs) steps += invs.length
    }
    return { stepCount: steps, estimatedTokens: tokens }
  }, [messages])

  // v6: Extract real usage from message metadata
  const realTokens = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as any
      if (msg.role === 'assistant' && msg.metadata?.usage?.totalTokens) {
        return msg.metadata.usage.totalTokens as number
      }
    }
    return 0
  }, [messages])

  // v6: Extract auto-routed model info from message metadata
  const autoRoutedModel = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as any
      if (msg.role === 'assistant' && msg.metadata?.autoRouted) {
        return { model: String(msg.metadata.model || ''), reason: 'Auto-routed' }
      }
    }
    return null
  }, [messages])

  // ─── Elapsed time tracking ────────────────────────────────────
  const streamStartRef = useRef<number>(0)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (isLoading) {
      streamStartRef.current = Date.now()
      setElapsed(0)
      const interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - streamStartRef.current) / 1000))
      }, 1000)
      return () => clearInterval(interval)
    } else {
      setElapsed(0)
    }
  }, [isLoading])

  const formatElapsed = useCallback((s: number) => {
    if (s < 60) return `${s}s`
    return `${Math.floor(s / 60)}m ${s % 60}s`
  }, [])

  const isEmpty = messages.length === 0

  const errorMessage = error
    ? error.message?.includes('429') ? 'Rate limited. Please wait a moment and retry.'
    : error.message?.includes('401') ? 'Session expired. Please sign in again.'
    : error.message?.includes('fetch') || error.message?.includes('network')
      ? 'Connection lost. Check your internet and retry.'
    : error.message || 'Something went wrong. Please try again.'
    : null

  return {
    // Chat state
    messages, input, setInput, isLoading, error, errorMessage,
    // UI state
    selectedModel, setSelectedModel, showModelPicker, setShowModelPicker,
    copiedId, loadingHistory, editingMessageId, editingContent,
    clearConfirm, envVars, elapsed, isEmpty,
    stepCount, estimatedTokens, realTokens, autoRoutedModel,
    // Refs
    messagesEndRef, inputRef, clearConfirmTimer, processedInvs,
    // Handlers
    handleSend, handleCopy, handleEditMessage, handleSaveEdit,
    handleRegenerate, handleEnvVarsSave, handleCancelTask, handleScroll,
    handleClearChat,
    setEditingMessageId, setEditingContent, setClearConfirm,
    stop, reload, setMessages, formatElapsed,
  }
}
