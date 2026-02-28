'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import {
  Send, Loader2, Bot, Copy, Check, Trash2,
  FileText, FolderPlus, GitBranch, Search,
  Terminal, Pencil, Eye, Globe, Rocket,
  AlertTriangle, CheckCircle, XCircle,
  StopCircle, Sparkles, ArrowUp, Lightbulb,
  Brain, Database, Wrench, RefreshCw,
  BookOpen, Save, Plug, ImageIcon,
  ChevronDown,
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
  load_chat_history: { label: 'Loading chat history', Icon: Database, color: 'blue' },
  github_pull_latest: { label: 'Pulling from GitHub', Icon: RefreshCw, color: 'green' },
  mcp_list_servers: { label: 'Listing MCP servers', Icon: Plug, color: 'purple' },
  mcp_connect_server: { label: 'Connecting MCP server', Icon: Plug, color: 'green' },
  mcp_call_tool: { label: 'Calling MCP tool', Icon: Plug, color: 'blue' },
  forge_check_npm_package: { label: 'Checking npm package', Icon: Search, color: 'blue' },
  forge_revert_commit: { label: 'Reverting commit', Icon: RefreshCw, color: 'red' },
  forge_create_branch: { label: 'Creating branch', Icon: GitBranch, color: 'green' },
  forge_create_pr: { label: 'Creating pull request', Icon: GitBranch, color: 'purple' },
  forge_merge_pr: { label: 'Merging pull request', Icon: GitBranch, color: 'green' },
  forge_deployment_status: { label: 'Checking deployment', Icon: Rocket, color: 'blue' },
  forge_check_build: { label: 'Running preview build', Icon: Rocket, color: 'yellow' },
  forge_list_branches: { label: 'Listing branches', Icon: GitBranch, color: 'blue' },
  forge_delete_branch: { label: 'Deleting branch', Icon: GitBranch, color: 'red' },
  forge_read_deploy_log: { label: 'Reading build log', Icon: Terminal, color: 'yellow' },
  db_introspect: { label: 'Inspecting table schema', Icon: Database, color: 'purple' },
  scaffold_component: { label: 'Scaffolding component', Icon: Sparkles, color: 'indigo' },
  generate_env_file: { label: 'Generating .env.example', Icon: FileText, color: 'green' },
  start_sandbox: { label: 'Starting sandbox', Icon: Rocket, color: 'green' },
  stop_sandbox: { label: 'Stopping sandbox', Icon: Terminal, color: 'red' },
  sandbox_status: { label: 'Checking sandbox', Icon: Rocket, color: 'blue' },
  add_image: { label: 'Finding image', Icon: ImageIcon, color: 'cyan' },
  check_task_status: { label: 'Checking task', Icon: RefreshCw, color: 'blue' },
}

const MODEL_OPTIONS = [
  { id: 'claude-sonnet-4-20250514', label: 'Sonnet 4', description: 'Fast & capable' },
  { id: 'claude-haiku-35-20241022', label: 'Haiku 3.5', description: 'Fastest' },
  { id: 'claude-opus-4-20250514', label: 'Opus 4', description: 'Most capable' },
] as const

const QUICK_ACTIONS = [
  { label: 'Landing Page', query: 'Build a modern landing page with hero section, features grid, testimonials with avatars, pricing table, and footer. Use a cohesive color palette with gradients and animations. Make it look like a real SaaS product.', icon: Sparkles },
  { label: 'Dashboard', query: 'Build an admin dashboard with sidebar navigation, stats cards with sparklines, a chart area, recent activity feed, and a data table with sorting. Dark theme, professional look.', icon: FolderPlus },
  { label: 'Portfolio', query: 'Create a portfolio site with animated hero, project showcase with hover effects, about section with skills, timeline, and a contact form. Minimal, elegant design.', icon: Globe },
  { label: 'E-commerce', query: 'Build an e-commerce product page with image gallery, size/color selector, add to cart, reviews section, and related products. Clean, modern design like Apple Store.', icon: FileText },
]

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

// ═══════════════════════════════════════════════════════════════════
// Markdown renderer (light theme)
// ═══════════════════════════════════════════════════════════════════

// Language label map for code blocks
const LANG_LABELS: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TSX', js: 'JavaScript', jsx: 'JSX',
  css: 'CSS', html: 'HTML', json: 'JSON', md: 'Markdown',
  bash: 'Bash', sh: 'Shell', sql: 'SQL', py: 'Python',
  yaml: 'YAML', yml: 'YAML', xml: 'XML', graphql: 'GraphQL',
  typescript: 'TypeScript', javascript: 'JavaScript',
}

// Lightweight syntax highlighting (no external deps)
function highlightCode(code: string, lang: string): string {
  const l = lang.toLowerCase()
  let html = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Comments (single-line)
  html = html.replace(/(\/\/.*?)$/gm, '<span class="text-gray-400 italic">$1</span>')
  // Multi-line comments
  html = html.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="text-gray-400 italic">$1</span>')
  // Strings (double/single/template)
  html = html.replace(/("(?:[^"\\]|\\.)*")/g, '<span class="text-emerald-600">$1</span>')
  html = html.replace(/('(?:[^'\\]|\\.)*')/g, '<span class="text-emerald-600">$1</span>')
  html = html.replace(/(`(?:[^`\\]|\\.)*`)/g, '<span class="text-emerald-600">$1</span>')

  if (['ts', 'tsx', 'js', 'jsx', 'typescript', 'javascript'].includes(l)) {
    // Keywords
    html = html.replace(/\b(import|export|from|default|const|let|var|function|return|if|else|for|while|class|extends|new|this|typeof|instanceof|async|await|try|catch|throw|switch|case|break|continue|interface|type|enum|implements|abstract|declare|readonly|as|is|in|of|yield)\b/g, '<span class="text-purple-600 font-medium">$1</span>')
    // Built-ins
    html = html.replace(/\b(true|false|null|undefined|console|document|window|Promise|Array|Object|Map|Set|Error|React|useState|useEffect|useRef|useCallback|useMemo)\b/g, '<span class="text-blue-600">$1</span>')
    // Numbers
    html = html.replace(/\b(\d+\.?\d*)\b/g, '<span class="text-amber-600">$1</span>')
    // JSX tags
    html = html.replace(/(&lt;\/?)([\w.]+)/g, '$1<span class="text-rose-600">$2</span>')
  } else if (['css', 'scss'].includes(l)) {
    html = html.replace(/([\w-]+)(?=\s*:)/g, '<span class="text-blue-600">$1</span>')
    html = html.replace(/(@[\w-]+)/g, '<span class="text-purple-600 font-medium">$1</span>')
    html = html.replace(/(#[\da-fA-F]{3,8})\b/g, '<span class="text-amber-600">$1</span>')
  } else if (['json'].includes(l)) {
    html = html.replace(/("[\w-]+")\s*:/g, '<span class="text-blue-600">$1</span>:')
    html = html.replace(/:\s*(\d+\.?\d*)/g, ': <span class="text-amber-600">$1</span>')
    html = html.replace(/:\s*(true|false|null)\b/g, ': <span class="text-purple-600">$1</span>')
  } else if (['bash', 'sh'].includes(l)) {
    html = html.replace(/(#.*?)$/gm, '<span class="text-gray-400 italic">$1</span>')
    html = html.replace(/\b(npm|npx|yarn|pnpm|git|cd|ls|rm|mkdir|cp|mv|echo|export|sudo|curl|wget)\b/g, '<span class="text-purple-600 font-medium">$1</span>')
  } else if (['html'].includes(l)) {
    html = html.replace(/(&lt;\/?)([\w-]+)/g, '$1<span class="text-rose-600">$2</span>')
    html = html.replace(/\b(class|id|src|href|style|type|name|value|placeholder)=/g, '<span class="text-amber-600">$1</span>=')
  }

  return html
}

let _codeBlockId = 0
function renderMarkdown(text: string): string {
  return text
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang: string, code: string) => {
      const id = `code-block-${++_codeBlockId}`
      const label = LANG_LABELS[lang] || lang || 'Code'
      const highlighted = lang ? highlightCode(code.trimEnd(), lang) : code.trimEnd().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      return `<div class="code-block-wrapper relative group/code my-2 rounded-lg border border-gray-200 overflow-hidden">
        <div class="flex items-center justify-between px-3 py-1 bg-gray-50 border-b border-gray-200">
          <span class="text-[10px] font-medium text-gray-400 uppercase tracking-wider">${label}</span>
          <button onclick="navigator.clipboard.writeText(document.getElementById('${id}').textContent).then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)})" class="text-[10px] text-gray-400 hover:text-gray-600 transition-colors px-1.5 py-0.5 rounded hover:bg-gray-100">Copy</button>
        </div>
        <pre class="bg-gray-50/50 text-gray-800 p-3 overflow-x-auto text-[12px] font-mono leading-relaxed"><code id="${id}">${highlighted}</code></pre>
      </div>`
    })
    .replace(/`([^`]+)`/g, '<code class="bg-indigo-50/80 px-1.5 py-0.5 rounded text-[12px] font-mono text-indigo-600 border border-indigo-100">$1</code>')
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
    case 'load_chat_history': return data ? `${(data as any).count || 0} messages` : 'Loading...'
    case 'github_pull_latest': return data?.ok ? `${(data as any).fileCount || 0} files pulled` : 'Pulling...'
    case 'check_task_status': {
      if (data?.status === 'completed') return `${data.type || 'Task'}: completed`
      if (data?.status === 'failed') return `${data.type || 'Task'}: failed`
      if (data?.status === 'running') return `${data.type || 'Task'}: running...`
      return 'Checking...'
    }
    default: return 'Done'
  }
}

// ═══════════════════════════════════════════════════════════════════
// Live file extraction
// ═══════════════════════════════════════════════════════════════════

type ToolInvocation = {
  toolName: string
  state: string
  args: Record<string, unknown>
  result?: Record<string, unknown>
}

function extractFileUpdates(
  inv: ToolInvocation,
  currentFiles: Record<string, string>,
): { updates?: Record<string, string>; deletes?: string[] } | null {
  const args = inv.args || {}

  switch (inv.toolName) {
    case 'write_file':
      if (typeof args.path === 'string' && typeof args.content === 'string') {
        return { updates: { [args.path]: args.content } }
      }
      return null

    case 'edit_file':
      if (inv.state === 'result' && inv.result && !('error' in inv.result)) {
        const path = args.path as string
        // Prefer authoritative content from server (solves chained edit race condition)
        if (typeof inv.result.content === 'string') {
          return { updates: { [path]: inv.result.content } }
        }
        // Fallback: re-apply locally (old behavior, for backwards compat)
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
          return { updates: { [args.newPath]: content }, deletes: [args.oldPath] }
        }
      }
      return null

    case 'create_project':
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
  pendingMessage?: string | null
  onPendingMessageSent?: () => void
}

export function ChatPanel({ projectName, projectId, files, onFileChange, onFileDelete, onBulkFileUpdate, githubToken, onRegisterSend, pendingMessage, onPendingMessageSent }: ChatPanelProps) {
  const [selectedModel, setSelectedModel] = useState<string>(MODEL_OPTIONS[0].id)
  const [showModelPicker, setShowModelPicker] = useState(false)

  const {
    messages,
    setMessages,
    stop,
    isLoading,
    error,
    append,
  } = useChat({
    api: '/api/chat',
    body: { projectName, projectId, files, githubToken, model: selectedModel },
    onError: (err) => console.error('Chat error:', err),
  })

  const [input, setInput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const processedInvs = useRef(new Set<string>())
  const localFiles = useRef<Record<string, string>>({})

  // Sync local files ref with props
  useEffect(() => {
    localFiles.current = { ...files }
  }, [files])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [messages, isLoading])

  // Load chat history on mount (once per project)
  useEffect(() => {
    if (!projectId || historyLoaded) return
    setHistoryLoaded(true)
    setLoadingHistory(true)

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
      .catch(() => {})
      .finally(() => setLoadingHistory(false))
  }, [projectId, historyLoaded, setMessages])

  // Live file extraction — works with both parts[] and legacy toolInvocations[]
  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue

      // Extract tool invocations from parts (preferred) or legacy field
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

        // Skip if the tool result is an error (e.g. write_file to invalid path)
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

  // Keep a stable ref to append so parent's send function always works
  const appendRef = useRef(append)
  useEffect(() => { appendRef.current = append }, [append])

  // Register send function for parent (once)
  useEffect(() => {
    if (onRegisterSend) {
      onRegisterSend((message: string) => {
        appendRef.current({ role: 'user', content: message })
      })
    }
  }, [onRegisterSend])

  // Handle pending messages from parent (e.g., "Fix with AI" button)
  useEffect(() => {
    if (pendingMessage && !isLoading) {
      append({ role: 'user', content: pendingMessage })
      onPendingMessageSent?.()
    }
  }, [pendingMessage, isLoading, append, onPendingMessageSent])

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleEditMessage = (messageId: string, content: string) => {
    setEditingMessageId(messageId)
    setEditingContent(content)
  }

  const handleSaveEdit = () => {
    if (!editingMessageId || !editingContent.trim()) return
    // Remove all messages from this point forward and resend
    const msgIndex = messages.findIndex(m => m.id === editingMessageId)
    if (msgIndex === -1) return
    const newMessages = messages.slice(0, msgIndex)
    setMessages(newMessages)
    processedInvs.current.clear()
    setEditingMessageId(null)
    // Re-send with edited content
    setTimeout(() => append({ role: 'user', content: editingContent.trim() }), 100)
  }

  const handleRegenerate = (messageId: string) => {
    // Find the assistant message and the preceding user message
    const msgIndex = messages.findIndex(m => m.id === messageId)
    if (msgIndex <= 0) return
    const userMsg = messages[msgIndex - 1]
    if (userMsg.role !== 'user') return
    // Remove from the assistant message onward
    const newMessages = messages.slice(0, msgIndex)
    setMessages(newMessages)
    processedInvs.current.clear()
    // Resend the user message
    setTimeout(() => append({ role: 'user', content: typeof userMsg.content === 'string' ? userMsg.content : '' }), 100)
  }

  const { stepCount, estimatedTokens } = useMemo(() => {
    let steps = 0
    let tokens = 0
    for (const msg of messages) {
      const textLen = typeof msg.content === 'string' ? msg.content.length : 0
      tokens += Math.ceil(textLen / 4) // rough estimate: ~4 chars per token
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

  const isEmpty = messages.length === 0

  return (
    <div className="h-full flex flex-col bg-forge-panel border-r border-forge-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-forge-border shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-forge-accent" />
          <span className="text-xs font-medium text-forge-text">Forge AI</span>
          {isLoading && stepCount > 0 && (
            <span className="text-[10px] text-forge-accent animate-pulse" title="Tool invocations processed">Step {stepCount}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Model picker */}
          <div className="relative">
            <button
              onClick={() => setShowModelPicker(prev => !prev)}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-forge-text-dim bg-forge-surface border border-forge-border rounded-md hover:border-forge-accent/50 hover:text-forge-text transition-all"
            >
              {MODEL_OPTIONS.find(m => m.id === selectedModel)?.label || 'Sonnet 4'}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showModelPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowModelPicker(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-forge-bg border border-forge-border rounded-lg shadow-lg overflow-hidden animate-slide-down">
                  {MODEL_OPTIONS.map(model => (
                    <button
                      key={model.id}
                      onClick={() => { setSelectedModel(model.id); setShowModelPicker(false) }}
                      className={cn(
                        'flex items-center justify-between w-full px-3 py-2 text-xs hover:bg-forge-surface transition-colors',
                        selectedModel === model.id && 'bg-forge-accent/10 text-forge-accent',
                      )}
                    >
                      <span className="font-medium">{model.label}</span>
                      <span className="text-[10px] text-forge-text-dim">{model.description}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => { setMessages([]); processedInvs.current.clear() }}
              className="p-2 sm:p-0 text-forge-text-dim hover:text-forge-danger transition-colors rounded"
              title="Clear chat"
              aria-label="Clear chat"
            >
              <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {loadingHistory ? (
          <div className="px-3 py-3 space-y-3 animate-fade-in">
            {/* Skeleton loading messages */}
            {[1, 2, 3].map(i => (
              <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'rounded-2xl p-3 space-y-2',
                  i % 2 === 0 ? 'bg-forge-accent/10 w-2/3' : 'bg-forge-surface w-3/4',
                )}>
                  <div className="h-3 rounded animate-skeleton w-full" />
                  <div className="h-3 rounded animate-skeleton w-4/5" />
                  {i % 2 !== 0 && <div className="h-3 rounded animate-skeleton w-3/5" />}
                </div>
              </div>
            ))}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full px-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-forge-accent/20 to-purple-500/20 flex items-center justify-center mb-5 shadow-sm">
              <Sparkles className="w-7 h-7 text-forge-accent" />
            </div>
            <h2 className="text-lg font-semibold text-forge-text mb-1">What shall we build?</h2>
            <p className="text-xs text-forge-text-dim text-center mb-6">Describe your idea and Forge builds it</p>
            <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
              {QUICK_ACTIONS.map(action => (
                <button
                  key={action.label}
                  onClick={() => handleSend(action.query)}
                  className="flex flex-col items-center gap-1.5 p-4 sm:p-3 text-center text-xs rounded-xl border border-forge-border bg-forge-surface hover:border-forge-accent/50 hover:bg-forge-accent/5 hover:shadow-sm active:scale-[0.98] transition-all group"
                >
                  <div className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-forge-accent/10 flex items-center justify-center group-hover:bg-forge-accent/20 transition-colors">
                    <action.icon className="w-5 h-5 sm:w-4 sm:h-4 text-forge-text-dim group-hover:text-forge-accent transition-colors" />
                  </div>
                  <span className="text-forge-text-dim group-hover:text-forge-text font-medium transition-colors">{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-3 py-3 space-y-3">
            {messages.map((message) => {
              const isUser = message.role === 'user'
              const textContent = typeof message.content === 'string' ? message.content : ''
              const parts = (message as any).parts as Array<{ type: string; text?: string; toolInvocation?: ToolInvocation }> | undefined

              return (
                <div key={message.id} className={cn('animate-fade-in', isUser ? 'flex justify-end' : '')}>
                  {isUser ? (
                    editingMessageId === message.id ? (
                      <div className="max-w-[85%] w-full">
                        <textarea
                          value={editingContent}
                          onChange={e => setEditingContent(e.target.value)}
                          className="w-full bg-forge-surface border border-forge-accent/50 rounded-xl px-3.5 py-2.5 text-sm text-forge-text outline-none resize-none"
                          rows={3}
                          autoFocus
                        />
                        <div className="flex justify-end gap-1.5 mt-1">
                          <button onClick={() => setEditingMessageId(null)} className="px-2 py-1 text-[10px] text-forge-text-dim hover:text-forge-text rounded transition-colors">Cancel</button>
                          <button onClick={handleSaveEdit} className="px-2 py-1 text-[10px] font-medium text-white bg-forge-accent rounded hover:bg-forge-accent-hover transition-colors">Resend</button>
                        </div>
                      </div>
                    ) : (
                      <div className="group/user flex items-start gap-1 max-w-[85%]">
                        <button
                          onClick={() => handleEditMessage(message.id, textContent)}
                          className="p-1 mt-1.5 rounded opacity-0 group-hover/user:opacity-100 text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-all"
                          title="Edit message"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <div className="px-3.5 py-2.5 rounded-2xl rounded-br-sm bg-forge-accent text-sm text-white shadow-sm">
                          {textContent}
                        </div>
                      </div>
                    )
                  ) : parts && parts.length > 0 ? (
                    /* Render parts in order — text and tool calls interleaved */
                    <div className="space-y-1.5 group/assistant">
                      {parts.map((part, partIdx) => {
                        // Collapse consecutive check_task_status polls — only show the last one
                        if (part.type === 'tool-invocation' && part.toolInvocation?.toolName === 'check_task_status') {
                          const nextPart = parts[partIdx + 1]
                          if (nextPart?.type === 'tool-invocation' && nextPart.toolInvocation?.toolName === 'check_task_status') {
                            return null // skip — a newer poll follows
                          }
                        }
                        if (part.type === 'text' && part.text) {
                          return (
                            <div key={partIdx} className="relative group">
                              <div
                                className="text-sm sm:text-[13px] leading-relaxed text-gray-700 [&_pre]:my-2 [&_code]:text-xs sm:[&_code]:text-[12px]"
                                dangerouslySetInnerHTML={{ __html: renderMarkdown(part.text) }}
                              />
                              <button
                                onClick={() => handleCopy(`${message.id}-${partIdx}`, part.text!)}
                                className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 sm:transition-opacity p-2 sm:p-1 rounded hover:bg-forge-surface"
                                aria-label="Copy message"
                                title="Copy"
                              >
                                {copiedId === `${message.id}-${partIdx}` ? <Check className="w-4 h-4 sm:w-3 sm:h-3 text-emerald-500" /> : <Copy className="w-4 h-4 sm:w-3 sm:h-3 text-forge-text-dim" />}
                              </button>
                            </div>
                          )
                        }

                        if (part.type === 'tool-invocation' && part.toolInvocation) {
                          const inv = part.toolInvocation
                          const info = TOOL_LABELS[inv.toolName] || { label: inv.toolName.replace(/_/g, ' '), Icon: Terminal, color: 'gray' }
                          const isRunning = inv.state !== 'result'
                          const hasError = inv.result && typeof inv.result === 'object' && 'error' in inv.result
                          const summary = getToolSummary(inv.toolName, inv.args || {}, inv.result)

                          if (inv.toolName === 'think' && inv.state === 'result') {
                            const planFiles = Array.isArray(inv.args?.files) ? inv.args.files as string[] : []
                            return (
                              <div key={partIdx} className="border border-purple-200 bg-purple-50 rounded-lg p-2.5 text-[11px]">
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
                                      <span key={fi} className="px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded text-[10px] font-mono">{f}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          }

                          if (inv.toolName === 'suggest_improvement' && inv.state === 'result') {
                            const sArgs = (inv.args || {}) as Record<string, string>
                            const priority = sArgs.priority || 'medium'
                            const priorityColor = priority === 'high' ? 'text-red-600 bg-red-50' : priority === 'medium' ? 'text-amber-600 bg-amber-50' : 'text-blue-600 bg-blue-50'
                            return (
                              <div key={partIdx} className="border border-amber-200 bg-amber-50 rounded-lg p-2.5 text-[11px]">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
                                  <span className="font-medium text-amber-600">Improvement Suggestion</span>
                                  <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-medium uppercase', priorityColor)}>{priority}</span>
                                </div>
                                <p className="text-amber-700 mb-1">{sArgs.issue || ''}</p>
                                {sArgs.suggestion && (
                                  <pre className="text-[10px] bg-gray-100 text-gray-700 rounded p-2 mt-1 whitespace-pre-wrap font-mono">{sArgs.suggestion}</pre>
                                )}
                                {sArgs.file && (
                                  <span className="inline-block mt-1 px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-mono">{sArgs.file}</span>
                                )}
                              </div>
                            )
                          }

                          return (
                            <div
                              key={partIdx}
                              className={cn(
                                'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] border transition-all',
                                isRunning ? 'border-forge-border animate-shimmer'
                                  : hasError ? 'border-red-200 bg-red-50'
                                  : 'border-forge-border bg-forge-surface/50',
                              )}
                            >
                              <div className={cn('w-5 h-5 rounded flex items-center justify-center shrink-0', colorClasses[info.color] || colorClasses.gray)}>
                                {isRunning ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : hasError ? <XCircle className="w-3 h-3 text-red-600" />
                                  : <info.Icon className="w-3 h-3" />}
                              </div>
                              <span className={cn('truncate flex-1', hasError ? 'text-red-600' : 'text-forge-text-dim')}>
                                {summary}
                              </span>
                              {!isRunning && !hasError && <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />}
                            </div>
                          )
                        }

                        return null
                      })}
                      {!isLoading && (
                        <button
                          onClick={() => handleRegenerate(message.id)}
                          className="flex items-center gap-1 mt-1 px-2 py-1 text-[10px] text-forge-text-dim hover:text-forge-accent opacity-0 group-hover/assistant:opacity-100 transition-all rounded hover:bg-forge-surface"
                          title="Regenerate response"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Regenerate
                        </button>
                      )}
                    </div>
                  ) : (
                    /* Fallback for messages without parts (e.g. loaded from DB) */
                    <div className="space-y-1.5 group/assistant">
                      {textContent && (
                        <div className="relative group">
                          <div
                            className="text-sm sm:text-[13px] leading-relaxed text-gray-700 [&_pre]:my-2 [&_code]:text-xs sm:[&_code]:text-[12px]"
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(textContent) }}
                          />
                          <button
                            onClick={() => handleCopy(message.id, textContent)}
                            className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 sm:transition-opacity p-2 sm:p-1 rounded hover:bg-forge-surface"
                            aria-label="Copy message"
                            title="Copy"
                          >
                            {copiedId === message.id ? <Check className="w-4 h-4 sm:w-3 sm:h-3 text-emerald-500" /> : <Copy className="w-4 h-4 sm:w-3 sm:h-3 text-forge-text-dim" />}
                          </button>
                        </div>
                      )}
                      {!isLoading && (
                        <button
                          onClick={() => handleRegenerate(message.id)}
                          className="flex items-center gap-1 mt-1 px-2 py-1 text-[10px] text-forge-text-dim hover:text-forge-accent opacity-0 group-hover/assistant:opacity-100 transition-all rounded hover:bg-forge-surface"
                          title="Regenerate response"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Regenerate
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {isLoading && (
              <div className="flex items-center gap-3 text-xs py-3 px-2 animate-fade-in">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-forge-accent animate-pulse-dot" />
                  <div className="w-1.5 h-1.5 rounded-full bg-forge-accent animate-pulse-dot" style={{ animationDelay: '0.2s' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-forge-accent animate-pulse-dot" style={{ animationDelay: '0.4s' }} />
                </div>
                <span className="text-forge-text-dim">
                  {stepCount > 0 ? `Building (step ${stepCount})...` : 'Thinking...'}
                </span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2.5 text-xs bg-red-50 border border-red-200 rounded-xl px-3.5 py-3 animate-fade-in">
                <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-red-700 mb-0.5">Something went wrong</p>
                  <p className="text-red-500 leading-relaxed">{error.message}</p>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-forge-border p-3 shrink-0 safe-bottom">
        <div className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px'
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
            }}
            placeholder={isEmpty ? 'Describe what you want to build...' : 'Ask for changes, new features, fixes...'}
            rows={1}
            className="w-full bg-forge-surface border border-forge-border rounded-xl pl-3.5 pr-14 py-3 sm:py-2.5 text-sm text-forge-text placeholder:text-forge-text-dim/50 outline-none focus:border-forge-accent/50 focus:ring-2 focus:ring-forge-accent/10 resize-none transition-all"
          />
          <div className="absolute right-2 bottom-2 sm:bottom-1.5">
            {isLoading ? (
              <button onClick={stop} className="p-2.5 sm:p-2 rounded-lg bg-red-100 text-forge-danger hover:bg-red-200 transition-colors" title="Stop generating">
                <StopCircle className="w-5 h-5 sm:w-4 sm:h-4" />
              </button>
            ) : (
              <button onClick={() => handleSend()} disabled={!input.trim()} className="p-2.5 sm:p-2 rounded-lg bg-forge-accent text-white hover:bg-forge-accent-hover disabled:opacity-20 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow">
                <Send className="w-5 h-5 sm:w-4 sm:h-4" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between mt-1.5 px-1 hidden sm:flex">
          <span className="text-[10px] text-forge-text-dim/60">
            Enter to send &middot; Shift+Enter for new line
          </span>
          {estimatedTokens > 0 && (
            <span className="text-[10px] text-forge-text-dim/60" title="Estimated token usage">
              ~{estimatedTokens > 1000 ? `${(estimatedTokens / 1000).toFixed(1)}k` : estimatedTokens} tokens
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
