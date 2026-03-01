'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { FileUIPart } from 'ai'
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

/** Convert a File to a data URL */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'])
const TEXT_EXTS = new Set([
  'ts','tsx','js','jsx','json','html','css','md','txt','yaml','yml','toml','xml','sql',
  'py','rb','go','rs','java','kt','swift','c','cpp','h','hpp','sh','bash','env',
  'gitignore','dockerignore','csv','log','ini','cfg','conf','vue','svelte','astro',
  'prisma','graphql','proto',
])
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const MAX_ATTACHMENTS = 10

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

  // ─── Stable refs for transport callback ──────────────────────
  const projectNameRef = useRef(projectName)
  const projectIdRef = useRef(projectId)
  const filesRef = useRef(files)
  const selectedModelRef = useRef(selectedModel)
  const envVarsRef = useRef(envVars)
  const activeFileRef = useRef(activeFile)
  useEffect(() => { projectNameRef.current = projectName }, [projectName])
  useEffect(() => { projectIdRef.current = projectId }, [projectId])
  useEffect(() => { filesRef.current = files }, [files])
  useEffect(() => { selectedModelRef.current = selectedModel }, [selectedModel])
  useEffect(() => { envVarsRef.current = envVars }, [envVars])
  useEffect(() => { activeFileRef.current = activeFile }, [activeFile])

  // ─── Memoized transport (stable across renders) ─────────────
  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    prepareSendMessagesRequest: ({ messages: msgs }) => ({
      body: {
        messages: msgs,
        projectName: projectNameRef.current,
        projectId: projectIdRef.current,
        files: filesRef.current,
        model: selectedModelRef.current,
        envVars: envVarsRef.current,
        activeFile: activeFileRef.current || undefined,
        activeFileContent: activeFileRef.current && filesRef.current[activeFileRef.current]
          ? filesRef.current[activeFileRef.current].split('\n').slice(0, 500).join('\n')
          : undefined,
      },
    }),
  }), []) // eslint-disable-line react-hooks/exhaustive-deps

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
    regenerate,
  } = useChat({
    transport,
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
  const [attachments, setAttachments] = useState<FileUIPart[]>([])

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

  // ─── Context warning + compaction detection from stream data parts ──
  const contextWarningShownRef = useRef<string | null>(null)
  const compactionShownRef = useRef<string | null>(null)
  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue
      const parts = (msg as any).parts as Array<{ type: string; data?: string }> | undefined
      if (!parts) continue
      for (const p of parts) {
        if (p.type === 'data' && typeof p.data === 'string') {
          try {
            const parsed = JSON.parse(p.data)
            if (parsed.type === 'context_warning' && contextWarningShownRef.current !== msg.id) {
              contextWarningShownRef.current = msg.id
              if (parsed.level === 'critical') {
                toast.error('Context limit nearly reached', {
                  description: `~${parsed.estimatedUsage}% of context used. Start a new chat to avoid failures.`,
                  duration: 8000,
                })
              } else {
                toast.warning('Context getting long', {
                  description: `~${parsed.estimatedUsage}% of context used. Consider starting a new chat soon.`,
                  duration: 6000,
                })
              }
            }
            if (parsed.type === 'compaction_notice' && compactionShownRef.current !== msg.id) {
              compactionShownRef.current = msg.id
              toast.info('Context compacted', {
                description: 'Older messages summarized to free up context space.',
                duration: 5000,
              })
            }
          } catch { /* not JSON data part — ignore */ }
        }
      }
    }
  }, [messages])

  // ─── Live file extraction from tool invocations ───────────────
  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue

      // v6: tool invocations are in message.parts as tool-call/tool-result/tool-<name> parts
      const parts = (msg as any).parts as Array<{ type: string; text?: string; toolInvocation?: ToolInvocation; toolName?: string; toolCallId?: string; state?: string; input?: any; args?: any; output?: any; result?: any }> | undefined

      // Extract tool invocations from parts (v6 generic, v6 named, and legacy formats)
      const invocations: ToolInvocation[] = []
      const seenToolCallIds = new Set<string>()
      if (parts) {
        for (const p of parts) {
          // v6 named format: type='tool-<name>' with state, input, output
          if (p.type?.startsWith('tool-') && p.type !== 'tool-call' && p.type !== 'tool-result' && p.type !== 'tool-invocation' && (p.toolName || p.state)) {
            const toolName = p.toolName || p.type.replace(/^tool-/, '')
            // Dedup: skip if we already processed this toolCallId
            if (p.toolCallId && seenToolCallIds.has(p.toolCallId)) continue
            if (p.toolCallId) seenToolCallIds.add(p.toolCallId)
            invocations.push({
              toolName,
              state: p.state === 'output-available' ? 'result'
                : p.state === 'input-available' ? 'call'
                : p.state || 'result',
              args: p.input || p.args || {},
              result: p.output ?? p.result,
            })
          }
          // v6 generic format: type='tool-call' (args available) or type='tool-result' (output available)
          else if ((p.type === 'tool-call' || p.type === 'tool-result') && p.toolName) {
            if (p.toolCallId && seenToolCallIds.has(p.toolCallId)) continue
            if (p.toolCallId) seenToolCallIds.add(p.toolCallId)
            invocations.push({
              toolName: p.toolName,
              state: p.type === 'tool-call' ? 'call' : 'result',
              args: p.input || p.args || {},
              result: p.output ?? p.result,
            })
          }
          // Legacy format from v4
          else if (p.type === 'tool-invocation' && p.toolInvocation) {
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

        // capture_preview — signal client to extract preview DOM content
        if (inv.toolName === 'capture_preview' && isResult) {
          processedInvs.current.add(key)
          window.dispatchEvent(new CustomEvent('forge:capture-preview', {
            detail: { messageId: msg.id, invocationIndex: i }
          }))
          continue
        }

        const changes = extractFileUpdates(inv, localFiles.current)
        if (!changes) continue

        processedInvs.current.add(key)
        // Cap Set size to prevent unbounded growth in long sessions
        if (processedInvs.current.size > 5000) {
          const entries = [...processedInvs.current]
          processedInvs.current = new Set(entries.slice(-2500))
        }

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

  // ─── Listen for capture_preview responses ───────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail) return
      const parts: string[] = ['[Preview Capture Result]']
      if (detail.error) {
        parts.push(`Error: ${detail.error}`)
      } else {
        if (detail.title) parts.push(`Title: ${detail.title}`)
        if (detail.elementCount) parts.push(`Elements: ${detail.elementCount}`)
        if (detail.viewport) parts.push(`Viewport: ${detail.viewport.width}x${detail.viewport.height}`)
        if (detail.bodyText) parts.push(`\nVisible content:\n${detail.bodyText}`)
      }
      sendMessage({ text: parts.join('\n') })
    }
    window.addEventListener('forge:preview-captured', handler)
    return () => window.removeEventListener('forge:preview-captured', handler)
  }, [sendMessage])

  // ─── Send / register / pending ────────────────────────────────
  const handleSend = useCallback((text?: string) => {
    const content = (text || input).trim()
    if (!content && attachments.length === 0) return
    if (isLoading) return
    setInput('')
    const currentAttachments = attachments
    setAttachments([])
    if (inputRef.current) inputRef.current.style.height = 'auto'
    // v6: sendMessage takes { text, files }
    sendMessage({
      text: content || 'Process these files',
      files: currentAttachments.length > 0 ? currentAttachments : undefined,
    })
  }, [input, isLoading, sendMessage, attachments])

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

  // ─── File attachments ──────────────────────────────────────────
  const handleAttachFiles = useCallback(async (fileList: FileList) => {
    const newParts: FileUIPart[] = []
    let skipped = 0

    for (const file of Array.from(fileList)) {
      if (attachments.length + newParts.length >= MAX_ATTACHMENTS) {
        toast.error(`Max ${MAX_ATTACHMENTS} attachments`)
        break
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} too large (max 2MB)`)
        continue
      }

      const ext = file.name.split('.').pop()?.toLowerCase() || ''

      if (IMAGE_TYPES.has(file.type)) {
        const dataUrl = await fileToDataUrl(file)
        newParts.push({ type: 'file', mediaType: file.type, url: dataUrl, filename: file.name })
      } else if (TEXT_EXTS.has(ext) || file.type.startsWith('text/')) {
        const text = await file.text()
        if (text.includes('\0')) { skipped++; continue }
        // Add to VFS so tools can operate on the file
        onFileChange(file.name, text)
        const dataUrl = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(text)))}`
        newParts.push({ type: 'file', mediaType: 'text/plain', url: dataUrl, filename: file.name })
      } else if (file.type === 'application/pdf') {
        const dataUrl = await fileToDataUrl(file)
        newParts.push({ type: 'file', mediaType: 'application/pdf', url: dataUrl, filename: file.name })
      } else {
        skipped++
      }
    }

    if (skipped > 0) toast.info(`Skipped ${skipped} unsupported file(s)`)
    if (newParts.length > 0) setAttachments(prev => [...prev, ...newParts])
  }, [attachments, onFileChange])

  const handleRemoveAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }, [])

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
    ? error.message?.includes('429') || error.message?.includes('rate limit') || error.message?.includes('overloaded')
      ? 'Claude is rate limited or overloaded. Wait a moment and retry.'
    : error.message?.includes('401')
      ? 'Session expired. Please sign in again.'
    : error.message?.includes('413') || error.message?.includes('context') || error.message?.includes('too long')
      ? 'Conversation is too long. Clear chat history or start a new project.'
    : error.message?.includes('408') || error.message?.includes('timeout')
      ? 'Request timed out. Try a simpler prompt.'
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
    clearConfirm, envVars, elapsed, isEmpty, attachments,
    stepCount, estimatedTokens, realTokens, autoRoutedModel,
    // Refs
    messagesEndRef, inputRef, clearConfirmTimer, processedInvs,
    // Handlers
    handleSend, handleCopy, handleEditMessage, handleSaveEdit,
    handleRegenerate, handleEnvVarsSave, handleCancelTask, handleScroll,
    handleClearChat, handleAttachFiles, handleRemoveAttachment,
    setEditingMessageId, setEditingContent, setClearConfirm,
    stop, regenerate, setMessages, formatElapsed,
  }
}
