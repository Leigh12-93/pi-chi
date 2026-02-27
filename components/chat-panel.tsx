'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useChat, type Message } from '@ai-sdk/react'
import {
  Send, Loader2, Bot, User, Copy, Check, Trash2,
  FileText, FolderPlus, GitCommit, GitBranch, Search,
  Terminal, Package, Pencil, Eye, Globe, Rocket,
  AlertTriangle, CheckCircle, XCircle, RotateCcw,
  StopCircle, Sparkles, ArrowUp, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import DOMPurify from 'dompurify'

// ═══════════════════════════════════════════════════════════════════
// Tool display config — adapted from AWB ai-chat-content.tsx
// ═══════════════════════════════════════════════════════════════════

const TOOL_LABELS: Record<string, { label: string; Icon: LucideIcon; color: string }> = {
  // File ops
  write_file: { label: 'Writing file', Icon: FileText, color: 'green' },
  read_file: { label: 'Reading file', Icon: Eye, color: 'blue' },
  edit_file: { label: 'Editing file', Icon: Pencil, color: 'yellow' },
  delete_file: { label: 'Deleting file', Icon: Trash2, color: 'red' },
  list_files: { label: 'Listing files', Icon: FolderPlus, color: 'blue' },
  search_files: { label: 'Searching files', Icon: Search, color: 'purple' },
  glob_files: { label: 'Finding files', Icon: Search, color: 'purple' },
  // Project ops
  create_project: { label: 'Creating project', Icon: Sparkles, color: 'indigo' },
  install_packages: { label: 'Installing packages', Icon: Package, color: 'green' },
  run_command: { label: 'Running command', Icon: Terminal, color: 'yellow' },
  // Git ops
  git_init: { label: 'Initializing git', Icon: GitBranch, color: 'orange' },
  git_status: { label: 'Checking status', Icon: GitBranch, color: 'blue' },
  git_add: { label: 'Staging files', Icon: GitBranch, color: 'green' },
  git_commit: { label: 'Committing', Icon: GitCommit, color: 'green' },
  git_push: { label: 'Pushing', Icon: ArrowUp, color: 'blue' },
  git_diff: { label: 'Getting diff', Icon: GitBranch, color: 'yellow' },
  git_log: { label: 'Getting history', Icon: GitBranch, color: 'blue' },
  git_branch: { label: 'Managing branches', Icon: GitBranch, color: 'purple' },
  git_clone: { label: 'Cloning repo', Icon: GitBranch, color: 'green' },
  git_remote: { label: 'Managing remotes', Icon: Globe, color: 'blue' },
  // Deploy
  deploy_vercel: { label: 'Deploying to Vercel', Icon: Rocket, color: 'blue' },
  deploy_gh_pages: { label: 'Creating GitHub repo', Icon: Rocket, color: 'green' },
}

const QUICK_ACTIONS = [
  { label: 'New Next.js App', query: 'Create a new Next.js project with Tailwind CSS', icon: Sparkles },
  { label: 'Landing Page', query: 'Build a modern landing page with hero section, features, and footer', icon: FileText },
  { label: 'Dashboard', query: 'Build an admin dashboard with sidebar navigation, charts, and data tables', icon: FolderPlus },
  { label: 'Portfolio', query: 'Create a portfolio website with project showcase, about section, and contact form', icon: Globe },
]

// ═══════════════════════════════════════════════════════════════════
// Markdown renderer — adapted from AWB
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

function getToolResultSummary(toolName: string, result: unknown): string {
  const data = (result && typeof result === 'object') ? result as Record<string, unknown> : null
  if (!data) return toolName.replace(/_/g, ' ')
  if (data.error) return `Failed: ${String(data.error).slice(0, 80)}`

  switch (toolName) {
    case 'write_file': return data.path ? `Created ${data.path} (${data.lines} lines)` : 'File written'
    case 'read_file': return data.path ? `Read ${data.path}` : 'File read'
    case 'edit_file': return data.path ? `Edited ${data.path}` : 'File edited'
    case 'delete_file': return data.path ? `Deleted ${data.path}` : 'Deleted'
    case 'list_files': {
      const files = data.files as unknown[]
      return files ? `${files.length} items` : 'Listed files'
    }
    case 'search_files': return `${data.count || 0} matches`
    case 'create_project': return data.template ? `Scaffolded ${data.template} project` : 'Project created'
    case 'install_packages': return data.success ? 'Packages installed' : 'Install failed'
    case 'run_command': return `Exit code: ${data.exitCode}`
    case 'git_commit': return data.success ? 'Committed' : 'Commit failed'
    case 'git_push': return data.success ? 'Pushed' : 'Push failed'
    case 'git_status': return 'Status loaded'
    case 'deploy_vercel': return data.success ? 'Deployed!' : 'Deploy failed'
    case 'deploy_gh_pages': return data.success ? 'Repo created & pushed' : 'Failed'
    default: {
      const info = TOOL_LABELS[toolName]
      if (info) return info.label.replace(/ing\b/, 'ed').replace(/ting\b/, 'ted')
      return toolName.replace(/_/g, ' ')
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Chat Panel Component
// ═══════════════════════════════════════════════════════════════════

interface ChatPanelProps {
  projectName: string
  onFilesChanged: () => void
}

export function ChatPanel({ projectName, onFilesChanged }: ChatPanelProps) {
  const {
    messages,
    input: chatInput,
    setInput: setChatInput,
    handleSubmit,
    setMessages,
    stop,
    isLoading: chatLoading,
    error,
    append,
  } = useChat({
    api: '/api/chat',
    body: { projectName },
    onError: (err) => {
      console.error('Chat error:', err)
    },
  })

  const [input, setInput] = useState('')
  const isLoading = chatLoading
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [messages, isLoading])

  // Trigger file refresh when AI finishes (it may have written files)
  const prevLoadingRef = useRef(isLoading)
  useEffect(() => {
    if (prevLoadingRef.current && !isLoading) {
      onFilesChanged()
    }
    prevLoadingRef.current = isLoading
  }, [isLoading, onFilesChanged])

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

  const handleClear = () => {
    setMessages([])
    inputRef.current?.focus()
  }

  const isEmpty = messages.length === 0

  return (
    <div className="h-full flex flex-col bg-forge-panel border-r border-forge-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-forge-border shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-forge-accent" />
          <span className="text-xs font-medium text-forge-text">AI Assistant</span>
        </div>
        {messages.length > 0 && (
          <button onClick={handleClear} className="text-forge-text-dim hover:text-forge-danger transition-colors">
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
            <p className="text-xs text-forge-text-dim text-center mb-6">Describe your idea and I'll create it</p>

            <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
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
              const toolInvocations = (message as any).toolInvocations as Array<{ toolName: string; state: string; args: Record<string, unknown>; result?: unknown }> | undefined

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
                <div key={message.id} className={cn('animate-fade-in', isUser ? 'flex justify-end' : '')}>
                  {isUser ? (
                    <div className="max-w-[85%] px-3 py-2 rounded-xl bg-forge-accent/20 text-sm text-forge-text">
                      {textContent}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {/* Tool invocations */}
                      {toolInvocations && toolInvocations.length > 0 && (
                        <div className="space-y-1">
                          {toolInvocations.map((invocation, i) => {
                            const toolName = invocation.toolName
                            const info = TOOL_LABELS[toolName] || { label: toolName.replace(/_/g, ' '), Icon: Terminal, color: 'gray' }
                            const isRunning = invocation.state === 'call' || invocation.state === 'partial-call'
                            const result = invocation.state === 'result' ? invocation.result : undefined
                            const hasError = result && typeof result === 'object' && 'error' in (result as Record<string, unknown>)
                            const summary = result ? getToolResultSummary(toolName, result) : info.label

                            return (
                              <div
                                key={i}
                                className={cn(
                                  'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] border transition-all',
                                  isRunning
                                    ? 'border-forge-border animate-shimmer'
                                    : hasError
                                      ? 'border-red-800/30 bg-red-950/20'
                                      : 'border-forge-border bg-forge-surface/50',
                                )}
                              >
                                <div className={cn('w-5 h-5 rounded flex items-center justify-center shrink-0', colorClasses[info.color] || colorClasses.gray)}>
                                  {isRunning ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : hasError ? (
                                    <XCircle className="w-3 h-3 text-red-400" />
                                  ) : (
                                    <info.Icon className="w-3 h-3" />
                                  )}
                                </div>
                                <span className={cn(
                                  'truncate',
                                  hasError ? 'text-red-300' : 'text-forge-text-dim',
                                )}>
                                  {summary}
                                </span>
                                {!isRunning && !hasError && (
                                  <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0 ml-auto" />
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Text content */}
                      {textContent && (
                        <div className="relative group">
                          <div
                            className="text-[13px] leading-relaxed text-gray-300 [&_pre]:my-2 [&_code]:text-[12px] [&_li]:text-[13px]"
                            dangerouslySetInnerHTML={{
                              __html: DOMPurify.sanitize(renderMarkdown(textContent)),
                            }}
                          />
                          <button
                            onClick={() => handleCopy(message.id, textContent)}
                            className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-forge-surface"
                          >
                            {copiedId === message.id ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3 text-forge-text-dim" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex items-center gap-2 text-forge-text-dim text-xs py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-forge-accent" />
                <span>Thinking...</span>
              </div>
            )}

            {/* Error */}
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

      {/* Input area */}
      <div className="border-t border-forge-border p-3 shrink-0">
        <div className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => {
              setInput(e.target.value)
              // Auto-resize
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder={isEmpty ? 'Describe what you want to build...' : 'Ask anything...'}
            rows={1}
            className="w-full bg-forge-surface border border-forge-border rounded-lg pl-3 pr-10 py-2.5 text-sm text-forge-text placeholder:text-forge-text-dim/50 outline-none focus:border-forge-accent/50 resize-none transition-colors"
          />
          <div className="absolute right-2 bottom-2 flex items-center gap-1">
            {isLoading ? (
              <button
                onClick={stop}
                className="p-1.5 rounded-md bg-forge-danger/20 text-forge-danger hover:bg-forge-danger/30 transition-colors"
                title="Stop generating"
              >
                <StopCircle className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => handleSend()}
                disabled={!input.trim()}
                className="p-1.5 rounded-md bg-forge-accent text-white hover:bg-forge-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
