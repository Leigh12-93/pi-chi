'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
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

  // ─── useChat ──────────────────────────────────────────────────
  const {
    messages,
    setMessages,
    stop,
    isLoading,
    error,
    append,
    reload,
    data,
  } = useChat({
    api: '/api/chat',
    body: {
      projectName, projectId, files, model: selectedModel, envVars,
      activeFile: activeFile || undefined,
      activeFileContent: activeFile && files[activeFile]
        ? files[activeFile].split('\n').slice(0, 500).join('\n')
        : undefined,
    },
    onError: (err) => console.error('Chat error:', err),
  })

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
            const loaded = data.messages.map((msg: any) => ({
              id: msg.id,
              role: msg.role,
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

  // ─── Live file extraction ─────────────────────────────────────
  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue

      const parts = (msg as any).parts as Array<{ type: string; toolInvocation?: ToolInvocation }> | undefined
      const invocations: ToolInvocation[] = parts
        ? parts.filter(p => p.type === 'tool-invocation' && p.toolInvocation).map(p => p.toolInvocation!)
        : ((msg as any).toolInvocations as ToolInvocation[] | undefined) || []

      for (let i = 0; i < invocations.length; i++) {
        const inv = invocations[i]
        const key = `${msg.id}:${inv.toolName}:${i}`

        if (processedInvs.current.has(key)) continue

        const processAtCall = ['write_file', 'delete_file'].includes(inv.toolName)
        const processAtResult = ['edit_file', 'create_project', 'rename_file'].includes(inv.toolName)

        const shouldProcess =
          (processAtCall && (inv.state === 'call' || inv.state === 'result')) ||
          (processAtResult && inv.state === 'result')

        if (!shouldProcess) continue

        if (inv.state === 'result' && inv.result && typeof inv.result === 'object' && 'error' in inv.result) {
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

        // Handle capture_preview
        if (inv.toolName === 'capture_preview' && inv.state === 'result') {
          const captureKey = `capture:${msg.id}:${i}`
          if (!processedInvs.current.has(captureKey)) {
            processedInvs.current.add(captureKey)
            try {
              const iframe = document.getElementById('forge-preview-iframe') as HTMLIFrameElement | null
              if (iframe?.contentDocument?.body) {
                const body = iframe.contentDocument.body
                const html = body.innerHTML.slice(0, 3000)
                const textContent = body.innerText.slice(0, 1500)
                const styles = Array.from(body.querySelectorAll('[class]'))
                  .slice(0, 20)
                  .map(el => `<${el.tagName.toLowerCase()} class="${el.className}">`)
                  .join('\n')
                append({
                  role: 'user',
                  content: `[Preview Capture — DOM snapshot for visual review]\n\nVisible text:\n${textContent}\n\nElement structure (first 20 styled elements):\n${styles}\n\nRaw HTML (truncated):\n\`\`\`html\n${html}\n\`\`\``,
                })
              } else {
                toast.info('Preview capture: iframe not accessible (cross-origin or not loaded)')
              }
            } catch {
              // Silently fail — capture is best-effort
            }
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
    append({ role: 'user', content })
  }, [input, isLoading, append])

  const appendRef = useRef(append)
  useEffect(() => { appendRef.current = append }, [append])

  useEffect(() => {
    if (onRegisterSend) {
      onRegisterSend((message: string) => {
        appendRef.current({ role: 'user', content: message })
      })
    }
  }, [onRegisterSend])

  useEffect(() => {
    if (pendingMessage && !isLoading) {
      append({ role: 'user', content: pendingMessage })
      onPendingMessageSent?.()
    }
  }, [pendingMessage, isLoading, append, onPendingMessageSent])

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
      append({ role: 'user', content: `Cancel the running task with ID: ${taskId}` })
    }
  }, [append])

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
    queueMicrotask(() => append({ role: 'user', content: editingContent.trim() }))
  }, [editingMessageId, editingContent, messages, setMessages, append])

  const handleRegenerate = useCallback((messageId: string) => {
    const msgIndex = messages.findIndex(m => m.id === messageId)
    if (msgIndex <= 0) return
    const userMsg = messages[msgIndex - 1]
    if (userMsg.role !== 'user') return
    const newMessages = messages.slice(0, msgIndex)
    setMessages(newMessages)
    processedInvs.current.clear()
    queueMicrotask(() => append({ role: 'user', content: typeof userMsg.content === 'string' ? userMsg.content : '' }))
  }, [messages, setMessages, append])

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
      const textLen = typeof msg.content === 'string' ? msg.content.length : 0
      tokens += Math.ceil(textLen / 4)
      if (msg.role !== 'assistant') continue
      const parts = (msg as any).parts as Array<{ type: string }> | undefined
      if (parts) {
        steps += parts.filter(p => p.type === 'tool-invocation').length
      } else {
        const invs = (msg as any).toolInvocations as ToolInvocation[] | undefined
        steps += invs?.length || 0
      }
    }
    return { stepCount: steps, estimatedTokens: tokens }
  }, [messages])

  const realTokens = useMemo(() => {
    if (!data || !Array.isArray(data)) return 0
    const usageEntries = data.filter((d: unknown) => d && typeof d === 'object' && (d as Record<string, unknown>).type === 'usage')
    if (usageEntries.length === 0) return 0
    const last = usageEntries[usageEntries.length - 1] as Record<string, unknown>
    return (last?.totalTokens as number) || 0
  }, [data])

  const autoRoutedModel = useMemo(() => {
    if (!data || !Array.isArray(data)) return null
    const suggestion = data.findLast((d: unknown) => d && typeof d === 'object' && (d as Record<string, unknown>).type === 'model_suggestion')
    if (!suggestion) return null
    const s = suggestion as Record<string, unknown>
    return { model: String(s.model || ''), reason: String(s.reason || '') }
  }, [data])

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
