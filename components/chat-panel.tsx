'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useChat } from '@ai-sdk/react'
import {
  Send, Loader2, Bot, Copy, Check, Trash2,
  FileText, FolderPlus, GitCommit, GitBranch, Search,
  Terminal, Package, Pencil, Eye, Globe, Rocket,
  AlertTriangle, CheckCircle, XCircle,
  StopCircle, Sparkles, ArrowUp, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ═══════════════════════════════════════════════════════════════════
// Tool display config
// ═══════════════════════════════════════════════════════════════════

const TOOL_LABELS: Record<string, { label: string; Icon: LucideIcon; color: string }> = {
  write_file: { label: 'Writing file', Icon: FileText, color: 'green' },
  read_file: { label: 'Reading file', Icon: Eye, color: 'blue' },
  edit_file: { label: 'Editing file', Icon: Pencil, color: 'yellow' },
  delete_file: { label: 'Deleting file', Icon: Trash2, color: 'red' },
  list_files: { label: 'Listing files', Icon: FolderPlus, color: 'blue' },
  search_files: { label: 'Searching files', Icon: Search, color: 'purple' },
  glob_files: { label: 'Finding files', Icon: Search, color: 'purple' },
  create_project: { label: 'Creating project', Icon: Sparkles, color: 'indigo' },
  github_create_repo: { label: 'Creating GitHub repo', Icon: GitBranch, color: 'green' },
  github_push_update: { label: 'Pushing to GitHub', Icon: ArrowUp, color: 'blue' },
  deploy_to_vercel: { label: 'Deploying to Vercel', Icon: Rocket, color: 'blue' },
  get_all_files: { label: 'Reading all files', Icon: Eye, color: 'blue' },
  rename_file: { label: 'Renaming file', Icon: Pencil, color: 'yellow' },
}

const QUICK_ACTIONS = [
  { label: 'Landing Page', query: 'Build a modern landing page with hero, features grid, testimonials, and footer using Next.js and Tailwind', icon: Sparkles },
  { label: 'Dashboard', query: 'Build an admin dashboard with sidebar nav, stats cards, chart area, and data table', icon: FolderPlus },
  { label: 'Portfolio', query: 'Create a portfolio site with project showcase, about section, skills, and contact form', icon: Globe },
  { label: 'Blog', query: 'Build a blog with article list, individual post pages, categories, and search', icon: FileText },
]

// ═══════════════════════════════════════════════════════════════════
// Markdown renderer
// ═══════════════════════════════════════════════════════════════════

function renderMarkdown(text: string): string {
  return text
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-gray-900/80 text-gray-100 rounded-lg p-3 my-2 overflow-x-auto text-[12px] font-mono leading-relaxed border border-gray-700/50"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-gray-800 px-1.5 py-0.5 rounded text-[12px] font-mono text-indigo-300">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 class="text-[13px] font-bold mt-3 mb-1 text-gray-200">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-sm font-bold mt-3 mb-1.5 text-gray-100">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-100">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 pl-1 list-decimal text-[13px] leading-relaxed">$1</li>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 pl-1 list-disc text-[13px] leading-relaxed">$1</li>')
    .replace(/\n\n/g, '</p><p class="mt-1.5">')
    .replace(/\n/g, '<br/>')
}

function getToolSummary(toolName: string, result: unknown): string {
  const data = (result && typeof result === 'object') ? result as Record<string, unknown> : null
  if (!data) return toolName.replace(/_/g, ' ')
  if (data.error) return `Failed: ${String(data.error).slice(0, 80)}`
  switch (toolName) {
    case 'write_file': return data.path ? `Created ${data.path} (${data.lines} lines)` : 'File written'
    case 'read_file': return data.path ? `Read ${data.path}` : 'File read'
    case 'edit_file': return data.path ? `Edited ${data.path}` : 'File edited'
    case 'delete_file': return data.path ? `Deleted ${data.path}` : 'Deleted'
    case 'create_project': return data.template ? `Scaffolded ${data.template} (${(data.files as string[])?.length} files)` : 'Created'
    case 'github_create_repo': return data.url ? `Created ${data.url}` : 'Repo created'
    case 'github_push_update': return data.success ? `Pushed ${data.filesCount} files` : 'Push failed'
    case 'deploy_to_vercel': return data.url ? `Deployed: ${data.url}` : 'Deploy failed'
    case 'list_files': return `${data.count || 0} files`
    case 'search_files': return `${data.count || 0} matches`
    case 'rename_file': return data.newPath ? `→ ${data.newPath}` : 'Renamed'
    default: return 'Done'
  }
}

// ═══════════════════════════════════════════════════════════════════
// File change extraction from tool results
// ═══════════════════════════════════════════════════════════════════

type ToolInvocation = {
  toolName: string
  state: string
  args: Record<string, unknown>
  result?: Record<string, unknown>
}

function extractFileChanges(toolInvocations: ToolInvocation[]): {
  updates: Record<string, string>
  deletes: string[]
} {
  const updates: Record<string, string> = {}
  const deletes: string[] = []

  for (const inv of toolInvocations) {
    if (inv.state !== 'result' || !inv.result) continue
    const result = inv.result

    switch (inv.toolName) {
      case 'write_file':
        if (result.success && typeof result.path === 'string' && typeof result.content === 'string') {
          updates[result.path] = result.content
        }
        break
      case 'edit_file':
        if (result.success && typeof result.path === 'string' && typeof result.content === 'string') {
          updates[result.path] = result.content
        }
        break
      case 'rename_file':
        if (result.success) {
          if (typeof result.oldPath === 'string') deletes.push(result.oldPath)
          if (typeof result.newPath === 'string' && typeof result.content === 'string') {
            updates[result.newPath] = result.content
          }
        }
        break
      case 'delete_file':
        if (result.success && typeof result.path === 'string') {
          deletes.push(result.path)
        }
        break
      case 'create_project':
        if (result.allFiles && typeof result.allFiles === 'object') {
          Object.assign(updates, result.allFiles)
        }
        break
    }
  }

  return { updates, deletes }
}

// ═══════════════════════════════════════════════════════════════════
// Chat Panel
// ═══════════════════════════════════════════════════════════════════

interface ChatPanelProps {
  projectName: string
  files: Record<string, string>
  onFileChange: (path: string, content: string) => void
  onFileDelete: (path: string) => void
  onBulkFileUpdate: (files: Record<string, string>) => void
}

export function ChatPanel({ projectName, files, onFileChange, onFileDelete, onBulkFileUpdate }: ChatPanelProps) {
  const {
    messages,
    setMessages,
    stop,
    isLoading,
    error,
    append,
  } = useChat({
    api: '/api/chat',
    body: { projectName, files },
    onError: (err) => console.error('Chat error:', err),
  })

  const [input, setInput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const processedMsgIds = useRef(new Set<string>())

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [messages, isLoading])

  // Extract file changes from tool results and apply to parent state
  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== 'assistant' || processedMsgIds.current.has(msg.id)) continue

      const invocations = (msg as any).toolInvocations as ToolInvocation[] | undefined
      if (!invocations || invocations.length === 0) continue

      // Only process if all invocations are in 'result' state
      const allDone = invocations.every(inv => inv.state === 'result')
      if (!allDone) continue

      processedMsgIds.current.add(msg.id)
      const { updates, deletes } = extractFileChanges(invocations)

      if (Object.keys(updates).length > 0) {
        onBulkFileUpdate(updates)
      }
      for (const path of deletes) {
        onFileDelete(path)
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

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const isEmpty = messages.length === 0

  const colorClasses: Record<string, string> = {
    green: 'text-emerald-400 bg-emerald-400/10',
    blue: 'text-blue-400 bg-blue-400/10',
    yellow: 'text-yellow-400 bg-yellow-400/10',
    red: 'text-red-400 bg-red-400/10',
    purple: 'text-purple-400 bg-purple-400/10',
    indigo: 'text-indigo-400 bg-indigo-400/10',
    orange: 'text-orange-400 bg-orange-400/10',
    gray: 'text-gray-400 bg-gray-400/10',
  }

  return (
    <div className="h-full flex flex-col bg-forge-panel border-r border-forge-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-forge-border shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-forge-accent" />
          <span className="text-xs font-medium text-forge-text">AI Builder</span>
        </div>
        {messages.length > 0 && (
          <button onClick={() => { setMessages([]); processedMsgIds.current.clear() }} className="text-forge-text-dim hover:text-forge-danger transition-colors">
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
            <p className="text-xs text-forge-text-dim text-center mb-6">Describe your idea and I'll build it</p>
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
                      {invocations && invocations.length > 0 && (
                        <div className="space-y-1">
                          {invocations.map((inv, i) => {
                            const info = TOOL_LABELS[inv.toolName] || { label: inv.toolName.replace(/_/g, ' '), Icon: Terminal, color: 'gray' }
                            const isRunning = inv.state === 'call' || inv.state === 'partial-call'
                            const hasError = inv.result && typeof inv.result === 'object' && 'error' in inv.result
                            const summary = inv.result ? getToolSummary(inv.toolName, inv.result) : info.label

                            return (
                              <div
                                key={i}
                                className={cn(
                                  'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] border transition-all',
                                  isRunning ? 'border-forge-border animate-shimmer'
                                    : hasError ? 'border-red-800/30 bg-red-950/20'
                                    : 'border-forge-border bg-forge-surface/50',
                                )}
                              >
                                <div className={cn('w-5 h-5 rounded flex items-center justify-center shrink-0', colorClasses[info.color] || colorClasses.gray)}>
                                  {isRunning ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : hasError ? <XCircle className="w-3 h-3 text-red-400" />
                                    : <info.Icon className="w-3 h-3" />}
                                </div>
                                <span className={cn('truncate', hasError ? 'text-red-300' : 'text-forge-text-dim')}>
                                  {summary}
                                </span>
                                {!isRunning && !hasError && <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0 ml-auto" />}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {textContent && (
                        <div className="relative group">
                          <div
                            className="text-[13px] leading-relaxed text-gray-300 [&_pre]:my-2 [&_code]:text-[12px]"
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
                <span>Building...</span>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/20 border border-red-800/30 rounded-lg px-3 py-2">
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
            placeholder={isEmpty ? 'Describe what you want to build...' : 'Ask anything...'}
            rows={1}
            className="w-full bg-forge-surface border border-forge-border rounded-lg pl-3 pr-10 py-2.5 text-sm text-forge-text placeholder:text-forge-text-dim/50 outline-none focus:border-forge-accent/50 resize-none transition-colors"
          />
          <div className="absolute right-2 bottom-2">
            {isLoading ? (
              <button onClick={stop} className="p-1.5 rounded-md bg-forge-danger/20 text-forge-danger hover:bg-forge-danger/30 transition-colors">
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
