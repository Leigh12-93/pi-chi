'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useChat } from '@ai-sdk/react'
import {
  Send, Loader2, Bot, Copy, Check, Trash2,
  FileText, FolderPlus, GitBranch, Search,
  Terminal, Pencil, Eye, Globe, Rocket,
  AlertTriangle, CheckCircle, XCircle,
  StopCircle, Sparkles, ArrowUp, Lightbulb,
  Brain, Database, Wrench, RefreshCw,
  BookOpen, Save,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ═══════════════════════════════════════════════════════════════════
// Tool display config
// ═══════════════════════════════════════════════════════════════════

const TOOL_LABELS: Record<string, { label: string; Icon: LucideIcon; color: string }> = {
  think: { label: 'Planning', Icon: Brain, color: 'purple' },
  suggest_improvement: { label: 'Suggestion', Icon: Lightbulb, color: 'yellow' },
  write_file: { label: 'Writing file', Icon: FileText, color: 'green' },
  read_file: { label: 'Reading file', Icon: Eye, color: 'blue' },
  edit_file: { label: 'Editing file', Icon: Pencil, color: 'yellow' },
  delete_file: { label: 'Deleting file', Icon: Trash2, color: 'red' },
  list_files: { label: 'Listing files', Icon: FolderPlus, color: 'blue' },
  search_files: { label: 'Searching files', Icon: Search, color: 'purple' },
  create_project: { label: 'Scaffolding project', Icon: Sparkles, color: 'indigo' },
  github_create_repo: { label: 'Creating GitHub repo', Icon: GitBranch, color: 'green' },
  github_push_update: { label: 'Pushing to GitHub', Icon: ArrowUp, color: 'blue' },
  deploy_to_vercel: { label: 'Deploying to Vercel', Icon: Rocket, color: 'blue' },
  get_all_files: { label: 'File manifest', Icon: Eye, color: 'blue' },
  rename_file: { label: 'Renaming file', Icon: Pencil, color: 'yellow' },
  // Superpower tools
  db_query: { label: 'Querying database', Icon: Database, color: 'green' },
  db_mutate: { label: 'Modifying database', Icon: Database, color: 'yellow' },
  save_project: { label: 'Saving project', Icon: Save, color: 'green' },
  forge_read_own_source: { label: 'Reading own source', Icon: BookOpen, color: 'purple' },
  forge_modify_own_source: { label: 'Self-modifying', Icon: Wrench, color: 'red' },
  forge_redeploy: { label: 'Redeploying self', Icon: RefreshCw, color: 'orange' },
  github_read_file: { label: 'Reading repo file', Icon: Eye, color: 'blue' },
  github_list_repo_files: { label: 'Listing repo files', Icon: FolderPlus, color: 'blue' },
  github_modify_external_file: { label: 'Modifying repo file', Icon: Pencil, color: 'yellow' },
  github_search_code: { label: 'Searching GitHub', Icon: Search, color: 'purple' },
}

const QUICK_ACTIONS = [
  { label: 'Landing Page', query: 'Build a modern landing page with hero section, features grid, testimonials with avatars, pricing table, and footer. Use a cohesive color palette with gradients and animations. Make it look like a real SaaS product.', icon: Sparkles },
  { label: 'Dashboard', query: 'Build an admin dashboard with sidebar navigation, stats cards with sparklines, a chart area, recent activity feed, and a data table with sorting. Dark theme, professional look.', icon: FolderPlus },
  { label: 'Portfolio', query: 'Create a portfolio site with animated hero, project showcase with hover effects, about section with skills, timeline, and a contact form. Minimal, elegant design.', icon: Globe },
  { label: 'E-commerce', query: 'Build an e-commerce product page with image gallery, size/color selector, add to cart, reviews section, and related products. Clean, modern design like Apple Store.', icon: FileText },
]

// ═══════════════════════════════════════════════════════════════════
// Markdown renderer
// ═══════════════════════════════════════════════════════════════════

function renderMarkdown(text: string): string {
  return text
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-gray-100 text-gray-800 rounded-lg p-3 my-2 overflow-x-auto text-[12px] font-mono leading-relaxed border border-gray-200"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-indigo-50 px-1.5 py-0.5 rounded text-[12px] font-mono text-indigo-600">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 class="text-[13px] font-bold mt-3 mb-1 text-gray-800">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-sm font-bold mt-3 mb-1.5 text-gray-900">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 pl-1 list-decimal text-[13px] leading-relaxed">$1</li>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 pl-1 list-disc text-[13px] leading-relaxed">$1</li>')
    .replace(/\n\n/g, '</p><p class="mt-1.5">')
    .replace(/\n/g, '<br/>')
}

function getToolSummary(toolName: string, args: Record<string, unknown>, result: unknown): string {
  const data = (result && typeof result === 'object') ? result as Record<string, unknown> : null
  if (data?.error) return `Error: ${String(data.error).slice(0, 80)}`

  switch (toolName) {
    case 'think': return args.plan ? String(args.plan).slice(0, 100) + (String(args.plan).length > 100 ? '...' : '') : 'Planning...'
    case 'suggest_improvement': return args.issue ? `${args.priority}: ${String(args.issue).slice(0, 80)}` : 'Suggestion logged'
    case 'write_file': return args.path ? `${args.path} (${String(args.content || '').split('\n').length}L)` : 'Writing...'
    case 'read_file': return args.path ? `${args.path}` : 'Reading...'
    case 'edit_file': return args.path ? `${args.path}` : 'Editing...'
    case 'delete_file': return args.path ? `${args.path}` : 'Deleting...'
    case 'create_project': return args.template ? `${args.template} template` : 'Scaffolding...'
    case 'github_create_repo': return args.repoName ? `${args.repoName}` : 'Creating...'
    case 'github_push_update': return data?.ok ? `${data.filesCount} files pushed` : 'Pushing...'
    case 'deploy_to_vercel': return data?.url ? `${data.url}` : 'Deploying...'
    case 'list_files': return data ? `${data.count || 0} files` : 'Listing...'
    case 'search_files': return data ? `${data.count || 0} matches` : 'Searching...'
    case 'rename_file': return args.newPath ? `→ ${args.newPath}` : 'Renaming...'
    case 'get_all_files': return data ? `${(data as any).totalFiles || 0} files` : 'Reading manifest...'
    // Superpower tools
    case 'db_query': return args.table ? `${args.table}${args.filters ? ` (${String(args.filters).slice(0, 40)})` : ''}` : 'Querying...'
    case 'db_mutate': return args.table ? `${args.operation} on ${args.table}` : 'Mutating...'
    case 'save_project': return data?.ok ? `${(data as any).savedFiles || 0} files saved` : 'Saving...'
    case 'forge_read_own_source': return args.path ? `forge/${args.path}` : 'Reading...'
    case 'forge_modify_own_source': return args.path ? `forge/${args.path}` : 'Modifying...'
    case 'forge_redeploy': return data?.ok ? `Deploying: ${(data as any).reason || ''}`.slice(0, 60) : 'Redeploying...'
    case 'github_read_file': return args.path ? `${args.owner}/${args.repo}/${args.path}` : 'Reading...'
    case 'github_list_repo_files': return args.repo ? `${args.owner}/${args.repo}/${args.path || ''}` : 'Listing...'
    case 'github_modify_external_file': return args.path ? `${args.owner}/${args.repo}/${args.path}` : 'Modifying...'
    case 'github_search_code': return args.query ? String(args.query).slice(0, 50) : 'Searching...'
    default: return 'Done'
  }
}

// ═══════════════════════════════════════════════════════════════════
// Live file extraction — processes tool invocations as they stream
// ═══════════════════════════════════════════════════════════════════

type ToolInvocation = {
  toolName: string
  state: string
  args: Record<string, unknown>
  result?: Record<string, unknown>
}

/**
 * Extract file changes from tool invocations.
 * For write_file: reads content from ARGS (not result) — available immediately at 'call' state.
 * For edit_file: applies old→new from ARGS against current file state.
 * For create_project: reads allFiles from RESULT (server-generated).
 */
function extractFileUpdates(
  inv: ToolInvocation,
  currentFiles: Record<string, string>,
): { updates?: Record<string, string>; deletes?: string[] } | null {
  const args = inv.args || {}

  switch (inv.toolName) {
    case 'write_file':
      // Available at 'call' state — content is in args
      if (typeof args.path === 'string' && typeof args.content === 'string') {
        return { updates: { [args.path]: args.content } }
      }
      return null

    case 'edit_file':
      // Apply edit locally from args
      if (inv.state === 'result' && inv.result && !('error' in inv.result)) {
        const path = args.path as string
        const oldStr = args.old_string as string
        const newStr = args.new_string as string
        const current = currentFiles[path]
        if (current && current.includes(oldStr)) {
          return { updates: { [path]: current.replace(oldStr, newStr) } }
        }
      }
      return null

    case 'delete_file':
      if (typeof args.path === 'string') {
        return { deletes: [args.path] }
      }
      return null

    case 'rename_file':
      if (typeof args.oldPath === 'string' && typeof args.newPath === 'string') {
        const content = currentFiles[args.oldPath]
        if (content !== undefined) {
          return {
            updates: { [args.newPath]: content },
            deletes: [args.oldPath],
          }
        }
      }
      return null

    case 'create_project':
      // Must wait for result — scaffold is generated server-side
      if (inv.state === 'result' && inv.result?.allFiles && typeof inv.result.allFiles === 'object') {
        return { updates: inv.result.allFiles as Record<string, string> }
      }
      return null

    default:
      return null
  }
}

// ═══════════════════════════════════════════════════════════════════
// Chat Panel
// ═══════════════════════════════════════════════════════════════════

interface ChatPanelProps {
  projectName: string
  projectId: string | null
  files: Record<string, string>
  onFileChange: (path: string, content: string) => void
  onFileDelete: (path: string) => void
  onBulkFileUpdate: (files: Record<string, string>) => void
  githubToken?: string
  onRegisterSend?: (sendFn: (message: string) => void) => void
}

export function ChatPanel({ projectName, projectId, files, onFileChange, onFileDelete, onBulkFileUpdate, githubToken, onRegisterSend }: ChatPanelProps) {
  const {
    messages,
    setMessages,
    stop,
    isLoading,
    error,
    append,
  } = useChat({
    api: '/api/chat',
    body: { projectName, projectId, files, githubToken },
    onError: (err) => console.error('Chat error:', err),
  })

  const [input, setInput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Track processed invocations individually (msg.id + invocation index)
  const processedInvs = useRef(new Set<string>())
  // Keep a running copy of files for edit_file to apply against
  const localFiles = useRef<Record<string, string>>({})

  // Sync local files ref with props
  useEffect(() => {
    localFiles.current = { ...files }
  }, [files])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [messages, isLoading])

  // ─── Live file extraction: process each invocation as it arrives ───
  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue
      const invocations = (msg as any).toolInvocations as ToolInvocation[] | undefined
      if (!invocations) continue

      for (let i = 0; i < invocations.length; i++) {
        const inv = invocations[i]
        const key = `${msg.id}:${i}`

        // Skip already-processed invocations
        if (processedInvs.current.has(key)) continue

        // Determine when to process based on tool type
        const processAtCall = ['write_file', 'delete_file'].includes(inv.toolName)
        const processAtResult = ['edit_file', 'create_project', 'rename_file'].includes(inv.toolName)

        const shouldProcess =
          (processAtCall && (inv.state === 'call' || inv.state === 'result')) ||
          (processAtResult && inv.state === 'result')

        if (!shouldProcess) continue

        const changes = extractFileUpdates(inv, localFiles.current)
        if (!changes) continue

        processedInvs.current.add(key)

        // Apply updates
        if (changes.updates && Object.keys(changes.updates).length > 0) {
          // Update local ref immediately for chained edits
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
  }, [messages, onBulkFileUpdate, onFileDelete])

  const handleSend = useCallback((text?: string) => {
    const content = (text || input).trim()
    if (!content || isLoading) return
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    append({ role: 'user', content })
  }, [input, isLoading, append])

  // Register the send function so parent can trigger actions
  useEffect(() => {
    if (onRegisterSend) {
      onRegisterSend((message: string) => {
        append({ role: 'user', content: message })
      })
    }
  }, [onRegisterSend, append])

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Count steps for progress indicator
  const stepCount = messages.reduce((acc, msg) => {
    const invs = (msg as any).toolInvocations as ToolInvocation[] | undefined
    return acc + (invs?.length || 0)
  }, 0)

  const isEmpty = messages.length === 0

  const colorClasses: Record<string, string> = {
    green: 'text-emerald-600 bg-emerald-50',
    blue: 'text-blue-600 bg-blue-50',
    yellow: 'text-amber-600 bg-amber-50',
    red: 'text-red-600 bg-red-50',
    purple: 'text-purple-600 bg-purple-50',
    indigo: 'text-indigo-600 bg-indigo-50',
    orange: 'text-orange-600 bg-orange-50',
    gray: 'text-gray-600 bg-gray-100',
  }

  return (
    <div className="h-full flex flex-col bg-forge-panel border-r border-forge-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-forge-border shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-forge-accent" />
          <span className="text-xs font-medium text-forge-text">Forge AI</span>
          {isLoading && stepCount > 0 && (
            <span className="text-[10px] text-forge-accent animate-pulse">
              Step {stepCount}
            </span>
          )}
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => { setMessages([]); processedInvs.current.clear() }}
            className="text-forge-text-dim hover:text-forge-danger transition-colors"
            title="Clear chat"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full px-6">
            <div className="w-12 h-12 rounded-xl bg-forge-accent/10 flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-forge-accent" />
            </div>
            <h2 className="text-lg font-semibold text-forge-text mb-1">What shall we build?</h2>
            <p className="text-xs text-forge-text-dim text-center mb-6">Describe your idea and Forge builds it</p>
            <div className="grid grid-cols-1 gap-2 w-full max-w-xs">
              {QUICK_ACTIONS.map(action => (
                <button
                  key={action.label}
                  onClick={() => handleSend(action.query)}
                  className="flex items-center gap-2 p-2.5 text-left text-xs rounded-lg border border-forge-border bg-forge-surface hover:border-forge-accent/50 hover:bg-forge-accent/5 transition-all group"
                >
                  <action.icon className="w-3.5 h-3.5 text-forge-text-dim group-hover:text-forge-accent shrink-0 transition-colors" />
                  <span className="text-forge-text-dim group-hover:text-forge-text transition-colors">{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-3 py-3 space-y-3">
            {messages.map((message) => {
              const isUser = message.role === 'user'
              const textContent = typeof message.content === 'string' ? message.content : ''
              const invocations = (message as any).toolInvocations as ToolInvocation[] | undefined

              return (
                <div key={message.id} className={cn('animate-fade-in', isUser ? 'flex justify-end' : '')}>
                  {isUser ? (
                    <div className="max-w-[85%] px-3 py-2 rounded-xl bg-forge-accent/20 text-sm text-forge-text">
                      {textContent}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {/* Tool invocations */}
                      {invocations && invocations.length > 0 && (
                        <div className="space-y-1">
                          {invocations.map((inv, i) => {
                            const info = TOOL_LABELS[inv.toolName] || { label: inv.toolName.replace(/_/g, ' '), Icon: Terminal, color: 'gray' }
                            const isRunning = inv.state === 'call' || inv.state === 'partial-call'
                            const hasError = inv.result && typeof inv.result === 'object' && 'error' in inv.result
                            const summary = getToolSummary(inv.toolName, inv.args || {}, inv.result)

                            // Special rendering for think tool
                            if (inv.toolName === 'think' && inv.state === 'result') {
                              const planFiles = Array.isArray(inv.args?.files) ? inv.args.files as string[] : []
                              return (
                                <div key={i} className="border border-purple-200 bg-purple-50 rounded-lg p-2.5 text-[11px]">
                                  <div className="flex items-center gap-1.5 mb-1.5 text-purple-600">
                                    <Brain className="w-3.5 h-3.5" />
                                    <span className="font-medium">Planning</span>
                                  </div>
                                  <div className="text-purple-700 leading-relaxed whitespace-pre-wrap">
                                    {String(inv.args?.plan || '').slice(0, 300)}
                                  </div>
                                  {planFiles.length > 0 && (
                                    <div className="mt-1.5 flex flex-wrap gap-1">
                                      {planFiles.map((f: string, fi: number) => (
                                        <span key={fi} className="px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded text-[10px] font-mono">
                                          {f}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )
                            }

                            // Special rendering for improvement suggestions
                            if (inv.toolName === 'suggest_improvement' && inv.state === 'result') {
                              const sArgs = (inv.args || {}) as Record<string, string>
                              const priority = sArgs.priority || 'medium'
                              const priorityColor = priority === 'high' ? 'text-red-600 bg-red-50' : priority === 'medium' ? 'text-amber-600 bg-amber-50' : 'text-blue-600 bg-blue-50'
                              return (
                                <div key={i} className="border border-amber-200 bg-amber-50 rounded-lg p-2.5 text-[11px]">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
                                    <span className="font-medium text-amber-600">Improvement Suggestion</span>
                                    <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-medium uppercase', priorityColor)}>
                                      {priority}
                                    </span>
                                  </div>
                                  <p className="text-amber-700 mb-1">{sArgs.issue || ''}</p>
                                  {sArgs.suggestion && (
                                    <pre className="text-[10px] bg-gray-100 text-gray-700 rounded p-2 mt-1 whitespace-pre-wrap font-mono">
                                      {sArgs.suggestion}
                                    </pre>
                                  )}
                                  {sArgs.file && (
                                    <span className="inline-block mt-1 px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-mono">
                                      {sArgs.file}
                                    </span>
                                  )}
                                </div>
                              )
                            }

                            // Standard tool badge
                            return (
                              <div
                                key={i}
                                className={cn(
                                  'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] border transition-all',
                                  isRunning ? 'border-forge-border animate-shimmer'
                                    : hasError ? 'border-red-200 bg-red-50'
                                    : 'border-forge-border bg-forge-surface/50',
                                )}
                              >
                                <div className={cn('w-5 h-5 rounded flex items-center justify-center shrink-0', colorClasses[info.color] || colorClasses.gray)}>
                                  {isRunning ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : hasError ? <XCircle className="w-3 h-3 text-red-400" />
                                    : <info.Icon className="w-3 h-3" />}
                                </div>
                                <span className={cn('truncate flex-1', hasError ? 'text-red-600' : 'text-forge-text-dim')}>
                                  {summary}
                                </span>
                                {!isRunning && !hasError && <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Text content */}
                      {textContent && (
                        <div className="relative group">
                          <div
                            className="text-[13px] leading-relaxed text-gray-700 [&_pre]:my-2 [&_code]:text-[12px]"
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(textContent) }}
                          />
                          <button
                            onClick={() => handleCopy(message.id, textContent)}
                            className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-forge-surface"
                          >
                            {copiedId === message.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-forge-text-dim" />}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {isLoading && (
              <div className="flex items-center gap-2 text-forge-text-dim text-xs py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-forge-accent" />
                <span>Building{stepCount > 0 ? ` (step ${stepCount})` : ''}...</span>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{error.message}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-forge-border p-3 shrink-0">
        <div className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
            }}
            placeholder={isEmpty ? 'Describe what you want to build...' : 'Ask for changes, new features, fixes...'}
            rows={1}
            className="w-full bg-forge-surface border border-forge-border rounded-lg pl-3 pr-10 py-2.5 text-sm text-forge-text placeholder:text-forge-text-dim/50 outline-none focus:border-forge-accent/50 resize-none transition-colors"
          />
          <div className="absolute right-2 bottom-2">
            {isLoading ? (
              <button onClick={stop} className="p-1.5 rounded-md bg-forge-danger/20 text-forge-danger hover:bg-forge-danger/30 transition-colors" title="Stop">
                <StopCircle className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={() => handleSend()} disabled={!input.trim()} className="p-1.5 rounded-md bg-forge-accent text-white hover:bg-forge-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
