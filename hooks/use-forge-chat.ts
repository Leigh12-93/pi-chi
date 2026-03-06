'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { FileUIPart } from 'ai'
import { toast } from 'sonner'
import { extractFileUpdates, type ToolInvocation } from '@/lib/chat/tool-utils'
import { clearMarkdownCache } from '@/lib/chat/markdown'
import { MODEL_OPTIONS, estimateCost, DESTRUCTIVE_TOOLS, DANGEROUS_COMMAND_PATTERNS } from '@/lib/chat/constants'

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

  // ─── Pre-flight message compaction (runs before sending to server) ───
  function compactMessagesForSend(msgs: any[]): any[] {
    if (msgs.length <= 10) return msgs

    // Estimate body size: messages + files
    const filesPayload = filesRef.current
    const filesSize = Object.values(filesPayload).reduce((sum, v) => sum + v.length, 0)
    let msgsSize = 0
    for (const m of msgs) {
      if (Array.isArray(m.parts)) {
        for (const p of m.parts) {
          if (p.type === 'text') {
            msgsSize += (p.text?.length || 0)
          } else {
            // Tool parts include full file content in input/args — measure real size
            const input = p.input || p.args
            if (input && typeof input === 'object') {
              const content = input.content || input.old_string || input.new_string || ''
              msgsSize += 300 + (typeof content === 'string' ? content.length : 0)
            } else {
              msgsSize += 300
            }
          }
        }
      } else if (typeof m.content === 'string') {
        msgsSize += m.content.length
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
      console.log(`[forge:preflight] Compacted ${dropped} messages (body ~${(estimatedBodyBytes / 1024 / 1024).toFixed(1)}MB)`)
      return [...first2, summaryMsg, ...recent6]
    }

    // Strip tool invocation details from older messages to reduce token count
    if (msgs.length > 12) {
      return msgs.map((m: any, i: number) => {
        if (i >= msgs.length - 8) return m // keep recent 8 intact
        if (m.role !== 'assistant' || !Array.isArray(m.parts)) return m
        const textParts = m.parts.filter((p: any) => p.type === 'text')
        const toolParts = m.parts.filter((p: any) => p.type !== 'text')
        if (toolParts.length === 0) return m
        const toolSummary = toolParts.map((p: any) => {
          const name = p.toolName || p.type?.replace(/^tool-/, '') || 'tool'
          const path = p.input?.path || p.args?.path || ''
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

  // ─── Memoized transport (stable across renders) ─────────────
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
      },
    }),
  }), []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── useChat (AI SDK v6) ──────────────────────────────────────
  // v6 uses transport instead of api, sendMessage instead of append,
  // status instead of isLoading, and parts-based messages
  const retryAfterCompactRef = useRef(false)
  const pendingRetryTextRef = useRef<string | null>(null)

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
          setMessages([...first2, summaryMsg as any, ...recent4])
          // Queue retry — effect below will pick it up after state settles
          if (retryText) {
            pendingRetryTextRef.current = retryText
          } else {
            retryAfterCompactRef.current = false
          }
        } else {
          retryAfterCompactRef.current = false
        }
      }
    },
  })

  // Derive isLoading from status (v6 pattern)
  const isLoading = status === 'streaming' || status === 'submitted'

  // ─── 413 retry: after emergency compaction, resend the last user message ──
  useEffect(() => {
    if (pendingRetryTextRef.current && !isLoading && retryAfterCompactRef.current) {
      const text = pendingRetryTextRef.current
      pendingRetryTextRef.current = null
      retryAfterCompactRef.current = false
      // Small delay to let React settle after setMessages
      const timer = setTimeout(() => {
        console.log('[forge:retry] Retrying after emergency compaction')
        sendMessage({ text })
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [messages, isLoading, sendMessage]) // messages change triggers this after setMessages

  // ─── UI state ─────────────────────────────────────────────────
  const [input, setInput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [clearConfirm, setClearConfirm] = useState(false)
  const [attachments, setAttachments] = useState<FileUIPart[]>([])
  const [tasks, setTasks] = useState<Array<{ id: string; label: string; status: string; description?: string; blockedBy?: string[]; phase?: string }>>([])
  const [showNewMessageIndicator, setShowNewMessageIndicator] = useState(false)
  const stoppedByUserRef = useRef(false)

  // ─── Approval gates ─────────────────────────────────────────
  const [pendingApproval, setPendingApproval] = useState<{
    toolName: string
    args: Record<string, unknown>
    key: string
  } | null>(null)
  const approvedKeys = useRef(new Set<string>())
  const deniedKeys = useRef(new Set<string>())

  // ─── Refs ─────────────────────────────────────────────────────
  const clearConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const processedInvs = useRef(new Set<string>())
  const historyLoadingRef = useRef(false)
  const localFiles = useRef<Record<string, string>>({})
  const isNearBottomRef = useRef(true)
  const diagnosedUrls = useRef(new Set<string>())

  // ─── Sync files ref (synchronous — must not be deferred via useEffect
  // to avoid stale reads during tool invocation processing) ─────────
  localFiles.current = { ...files }

  // Clear markdown cache when switching projects
  useEffect(() => {
    clearMarkdownCache()
  }, [projectId])

  // ─── Scroll tracking ─────────────────────────────────────────
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
    isNearBottomRef.current = nearBottom
    setShowNewMessageIndicator(!nearBottom)
  }, [])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setShowNewMessageIndicator(false)
  }, [])

  // Escape to stop generation
  useEffect(() => {
    if (!isLoading) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); stoppedByUserRef.current = true; stop() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isLoading, stop])

  // Toast when user-initiated stop completes
  const wasLoadingRef = useRef(false)
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading && stoppedByUserRef.current) {
      toast.info('Generation stopped', { duration: 2000 })
      stoppedByUserRef.current = false
    }
    wasLoadingRef.current = isLoading
  }, [isLoading])

  // Auto-scroll when near bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isLoading])

  // ─── Load chat history ────────────────────────────────────────
  useEffect(() => {
    if (!projectId || historyLoaded) return
    if (historyLoadingRef.current) return
    historyLoadingRef.current = true
    setHistoryLoaded(true)
    setLoadingHistory(true)

    const loadWithRetry = async (attempt = 0) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/messages`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (data.messages?.length > 0) {
          const loaded = data.messages.map((msg: any) => ({
            id: msg.id,
            role: msg.role,
            parts: [{ type: 'text', text: msg.content || '' }],
            content: msg.content || '',
          }))
          setMessages(loaded)
        }
      } catch (err) {
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
          return loadWithRetry(attempt + 1)
        }
        console.warn('Failed to load chat history after retries:', err)
        toast.error('Could not load chat history', { description: 'Previous messages may be missing.', duration: 4000 })
      } finally {
        setLoadingHistory(false)
        historyLoadingRef.current = false
      }
    }
    loadWithRetry()
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

        // ── Approval gate: check if this is a destructive tool ──
        const isDestructive = DESTRUCTIVE_TOOLS.has(inv.toolName) ||
          (inv.toolName === 'run_command' && typeof inv.args?.command === 'string' && DANGEROUS_COMMAND_PATTERNS.test(inv.args.command as string))

        if (isDestructive && !approvedKeys.current.has(key) && !deniedKeys.current.has(key)) {
          // Check localStorage for pre-approved tools
          let preApproved = false
          try {
            const stored = JSON.parse(localStorage.getItem('forge:approved-tools') || '[]')
            preApproved = stored.includes(inv.toolName)
          } catch { /* ignore */ }

          if (!preApproved) {
            // Show approval card but don't block other processing
            if (!pendingApproval || pendingApproval.key !== key) {
              setPendingApproval({ toolName: inv.toolName, args: inv.args || {}, key })
            }
            // Skip applying this tool's changes until approved
            if (inv.toolName === 'delete_file') continue
          }
        }

        if (deniedKeys.current.has(key)) {
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

        // Terminal tools — dispatch action event for workspace/terminal panel
        const terminalTools = ['run_command', 'install_package', 'run_dev_server', 'run_build', 'run_tests', 'check_types', 'verify_build']
        if (terminalTools.includes(inv.toolName) && isResult && inv.result) {
          const result = inv.result as Record<string, unknown>
          if (result.__terminal_action) {
            processedInvs.current.add(key)
            window.dispatchEvent(new CustomEvent('forge:terminal-action', {
              detail: result
            }))
            continue
          }
        }

        // ── Gate tools: present_plan, ask_user, checkpoint ──
        // These tools produce inline cards — mark as processed so they don't
        // trigger file extraction, but do NOT skip them (they render in message-item)
        if (['present_plan', 'ask_user', 'checkpoint'].includes(inv.toolName) && (isCall || isResult)) {
          const gateArgs = inv.args as Record<string, unknown>
          if (gateArgs?.__plan_gate || gateArgs?.__ask_gate || gateArgs?.__checkpoint || gateArgs?.files || gateArgs?.question) {
            processedInvs.current.add(key)
            // Check auto-approve for plans
            if (inv.toolName === 'present_plan' && (isCall || isResult)) {
              try {
                const autoApprove = localStorage.getItem('forge:auto-approve-plans') === 'true'
                if (autoApprove) {
                  sendMessage({ text: '[PLAN APPROVED]' })
                }
              } catch {}
            }
            continue
          }
        }

        // Audit plan — dispatch event for workspace to display audit panel
        // AND mark as processed so the inline card renders
        if (inv.toolName === 'create_audit_plan' && (isCall || isResult)) {
          const result = (inv.result || inv.args) as Record<string, unknown>
          if (result?.__audit_gate || result?.plan || result?.findings) {
            processedInvs.current.add(key)
            window.dispatchEvent(new CustomEvent('forge:audit-plan', {
              detail: result.plan || result
            }))
            continue
          }
        }

        // Task list — extract tasks from manage_tasks tool (with deps/phases)
        if (inv.toolName === 'manage_tasks' && (isCall || isResult)) {
          const taskArgs = inv.args as { tasks?: Array<{ id: string; label: string; status: string; description?: string; blockedBy?: string[]; phase?: string }> }
          if (Array.isArray(taskArgs?.tasks)) {
            setTasks(taskArgs.tasks)
          }
          processedInvs.current.add(key)
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
          // Signal workspace that AI edited these files (for highlight animation + diff badges)
          window.dispatchEvent(new CustomEvent('forge:file-edited', {
            detail: { paths: Object.keys(changes.updates) }
          }))
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

  // ─── Listen for preview errors — auto-diagnose ──────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail?.url) return
      const key = `preview-error:${detail.url}`
      if (diagnosedUrls.current.has(key)) return
      diagnosedUrls.current.add(key)
      sendMessage({
        text: `[PREVIEW ERROR] The preview at ${detail.url} failed to load (${detail.errorType || 'unknown'}). Please use diagnose_preview to check the headers and suggest fixes.`,
      })
    }
    window.addEventListener('forge:preview-error', handler)
    return () => window.removeEventListener('forge:preview-error', handler)
  }, [sendMessage])

  // ─── Listen for auto-audit trigger (from project load/import) ──
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail?.message) return
      if (detail.projectId && detail.projectId !== projectIdRef.current) return
      if (!isLoading && detail.message) {
        sendMessage({ text: detail.message })
      }
    }
    window.addEventListener('forge:auto-audit', handler)
    return () => window.removeEventListener('forge:auto-audit', handler)
  }, [isLoading, sendMessage])

  // ─── Send / register / pending ────────────────────────────────
  const handleSend = useCallback((text?: string) => {
    const content = (text || input).trim()
    if (!content && attachments.length === 0) return

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
  const { stepCount, estimatedTokens, currentActivity, lastCompletedToolName } = useMemo(() => {
    let steps = 0
    let tokens = 0
    let activity: { toolName: string; args: Record<string, unknown> } | null = null
    const recentCompleted: Array<{ toolName: string; args: Record<string, unknown> }> = []

    for (const msg of messages) {
      const textLen = getMessageText(msg).length
      tokens += Math.ceil(textLen / 4)
      if (msg.role !== 'assistant') continue
      const parts = (msg as any).parts as Array<{ type: string; toolName?: string; toolInvocation?: ToolInvocation; state?: string; input?: Record<string, unknown>; args?: Record<string, unknown> }> | undefined
      if (parts) {
        for (const p of parts) {
          const isTool = p.type === 'tool-invocation' || p.type?.startsWith('tool-')
          if (!isTool) continue
          steps++
          const tName = p.toolInvocation?.toolName || p.toolName || p.type?.replace(/^tool-/, '') || ''
          const tArgs = p.toolInvocation?.args || p.input || p.args || {}
          const tState = p.toolInvocation?.state || p.state || ''
          const isRunning = tState !== 'result' && tState !== 'output-available' && tState !== 'output-error'
          if (isRunning) {
            activity = { toolName: tName, args: tArgs }
          } else {
            recentCompleted.push({ toolName: tName, args: tArgs })
          }
        }
      }
      const invs = (msg as any).toolInvocations as ToolInvocation[] | undefined
      if (invs) steps += invs.length
    }

    const lastCompleted = recentCompleted.length > 0
      ? recentCompleted[recentCompleted.length - 1].toolName
      : null

    return {
      stepCount: steps,
      estimatedTokens: tokens,
      lastCompletedToolName: lastCompleted,
      currentActivity: activity
        ? { ...activity, recentCompleted: recentCompleted.slice(-3) }
        : recentCompleted.length > 0
          ? { toolName: '', args: {}, recentCompleted: recentCompleted.slice(-3) }
          : null,
    }
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

  // ─── Session cost tracking ──────────────────────────────────
  const sessionCost = useMemo(() => {
    let totalCost = 0
    let totalInput = 0
    let totalOutput = 0
    for (const msg of messages) {
      const meta = (msg as any).metadata
      if (meta?.usage && meta?.model) {
        const inTok = meta.usage.inputTokens || 0
        const outTok = meta.usage.outputTokens || 0
        totalInput += inTok
        totalOutput += outTok
        totalCost += estimateCost(inTok, outTok, meta.model)
      }
    }
    return { cost: totalCost, inputTokens: totalInput, outputTokens: totalOutput }
  }, [messages])

  // ─── Per-message cost data (for cost chips) ─────────────────
  const getMessageCost = useCallback((msgId: string) => {
    const msg = messages.find(m => m.id === msgId) as any
    if (!msg?.metadata?.usage || !msg?.metadata?.model) return null
    const { inputTokens = 0, outputTokens = 0 } = msg.metadata.usage
    const cost = estimateCost(inputTokens, outputTokens, msg.metadata.model)
    return { inputTokens, outputTokens, cost, model: msg.metadata.model }
  }, [messages])

  // ─── Approval gate handlers ─────────────────────────────────
  const handleApprove = useCallback((key: string) => {
    approvedKeys.current.add(key)
    setPendingApproval(null)
  }, [])

  const handleDeny = useCallback((key: string) => {
    deniedKeys.current.add(key)
    setPendingApproval(null)
    // Inject a synthetic message telling the AI the action was denied
    const denied = deniedKeys.current
    if (denied.has(key)) {
      const parts = key.split(':')
      const toolName = parts[1] || 'the operation'
      sendMessage({ text: `I denied ${toolName.replace(/_/g, ' ')}. Please try a different approach.` })
    }
  }, [sendMessage])

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
    messages, input, setInput, isLoading, status, error, errorMessage,
    // UI state
    selectedModel, setSelectedModel, showModelPicker, setShowModelPicker,
    copiedId, loadingHistory, editingMessageId, editingContent,
    clearConfirm, envVars, elapsed, isEmpty, attachments,
    tasks, showNewMessageIndicator, scrollToBottom,
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
    stop, regenerate, setMessages, formatElapsed, stoppedByUserRef,
  }
}
