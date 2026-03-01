'use client'

import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react'
import { useChat } from '@ai-sdk/react'
import {
  Send, Loader2, Bot, Copy, Check, Trash2,
  FileText, FolderPlus, GitBranch, Search,
  Terminal, Pencil, Eye, Globe, Rocket,
  AlertTriangle, CheckCircle, XCircle,
  StopCircle, Sparkles, ArrowUp, Lightbulb,
  Brain, Database, Wrench, RefreshCw,
  BookOpen, Save, Plug, ImageIcon, Package,
  ChevronDown, ExternalLink, Clock, Key,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ErrorBoundary } from '@/components/error-boundary'
import DOMPurify from 'dompurify'

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
  request_env_vars: { label: 'Environment setup', Icon: Key, color: 'amber' },
  start_sandbox: { label: 'Starting sandbox', Icon: Rocket, color: 'green' },
  stop_sandbox: { label: 'Stopping sandbox', Icon: Terminal, color: 'red' },
  sandbox_status: { label: 'Checking sandbox', Icon: Rocket, color: 'blue' },
  add_image: { label: 'Finding image', Icon: ImageIcon, color: 'cyan' },
  check_task_status: { label: 'Checking task', Icon: RefreshCw, color: 'blue' },
  grep_files: { label: 'Grepping files', Icon: BookOpen, color: 'purple' },
  add_dependency: { label: 'Adding package', Icon: Package, color: 'green' },
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
  green: 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40',
  blue: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/40',
  yellow: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40',
  red: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/40',
  purple: 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/40',
  indigo: 'text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-950/40',
  orange: 'text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-950/40',
  gray: 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800/50',
  cyan: 'text-cyan-600 bg-cyan-50 dark:text-cyan-400 dark:bg-cyan-950/40',
  amber: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40',
}

// ═══════════════════════════════════════════════════════════════════
// Markdown renderer (light theme)
// ══════════════════════════════════════�����═════════════════════���══════

// Language label map for code blocks
const LANG_LABELS: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TSX', js: 'JavaScript', jsx: 'JSX',
  css: 'CSS', html: 'HTML', json: 'JSON', md: 'Markdown',
  bash: 'Bash', sh: 'Shell', sql: 'SQL', py: 'Python',
  yaml: 'YAML', yml: 'YAML', xml: 'XML', graphql: 'GraphQL',
  typescript: 'TypeScript', javascript: 'JavaScript',
}

// Lightweight syntax highlighting (no external deps)
/**
 * Single-pass tokenizer-based code highlighter.
 * Processes code character-by-character so earlier tokens (comments, strings)
 * are never re-matched by later passes (keywords, numbers). Prevents the
 * broken-HTML double-highlighting bug.
 */
function highlightCode(code: string, lang: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const l = lang.toLowerCase()
  const isJS = ['ts','tsx','js','jsx','typescript','javascript'].includes(l)
  const isCSS = ['css','scss'].includes(l)
  const isJSON = ['json'].includes(l)
  const isBash = ['bash','sh'].includes(l)
  const isHTML = ['html'].includes(l)

  const JS_KEYWORDS = new Set('import,export,from,default,const,let,var,function,return,if,else,for,while,class,extends,new,this,typeof,instanceof,async,await,try,catch,throw,switch,case,break,continue,interface,type,enum,implements,abstract,declare,readonly,as,is,in,of,yield'.split(','))
  const JS_BUILTINS = new Set('true,false,null,undefined,console,document,window,Promise,Array,Object,Map,Set,Error,React,useState,useEffect,useRef,useCallback,useMemo'.split(','))
  const BASH_CMDS = new Set('npm,npx,yarn,pnpm,git,cd,ls,rm,mkdir,cp,mv,echo,export,sudo,curl,wget'.split(','))

  type Token = { type: 'comment'|'string'|'keyword'|'builtin'|'number'|'tag'|'property'|'plain'; text: string }
  const tokens: Token[] = []
  let i = 0

  const addPlain = (text: string) => {
    if (!text) return
    const last = tokens[tokens.length - 1]
    if (last?.type === 'plain') last.text += text
    else tokens.push({ type: 'plain', text })
  }

  while (i < code.length) {
    // Single-line comment
    if ((isJS || isBash || isCSS) && (isJS || isCSS ? code[i] === '/' && code[i+1] === '/' : code[i] === '#')) {
      const start = i
      while (i < code.length && code[i] !== '\n') i++
      tokens.push({ type: 'comment', text: code.slice(start, i) })
      continue
    }
    // Multi-line comment
    if ((isJS || isCSS) && code[i] === '/' && code[i+1] === '*') {
      const start = i
      i += 2
      while (i < code.length && !(code[i-1] === '*' && code[i] === '/')) i++
      i++
      tokens.push({ type: 'comment', text: code.slice(start, i) })
      continue
    }
    // Strings
    if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
      const quote = code[i]
      const start = i
      i++
      while (i < code.length && code[i] !== quote) { if (code[i] === '\\') i++; i++ }
      i++ // closing quote
      tokens.push({ type: 'string', text: code.slice(start, i) })
      continue
    }
    // Words (identifiers, keywords, numbers)
    if (/[\w$]/.test(code[i])) {
      const start = i
      while (i < code.length && /[\w$.]/.test(code[i])) i++
      const word = code.slice(start, i)
      if (isJS && JS_KEYWORDS.has(word)) tokens.push({ type: 'keyword', text: word })
      else if (isJS && JS_BUILTINS.has(word)) tokens.push({ type: 'builtin', text: word })
      else if (isBash && BASH_CMDS.has(word)) tokens.push({ type: 'keyword', text: word })
      else if (isJSON && /^(true|false|null)$/.test(word)) tokens.push({ type: 'builtin', text: word })
      else if (/^\d+\.?\d*$/.test(word)) tokens.push({ type: 'number', text: word })
      else addPlain(word)
      continue
    }
    // HTML/JSX tags
    if ((isJS || isHTML) && code[i] === '<' && /[a-zA-Z\/]/.test(code[i+1] || '')) {
      const prefix = code[i] + (code[i+1] === '/' ? '/' : '')
      i += prefix.length
      const start = i
      while (i < code.length && /[\w.-]/.test(code[i])) i++
      const tagName = code.slice(start, i)
      if (tagName) {
        addPlain(esc(prefix.replace('/', '&#47;')))
        tokens.push({ type: 'tag', text: tagName })
      } else {
        addPlain(esc(prefix))
      }
      continue
    }
    // CSS properties
    if (isCSS && /[a-zA-Z-]/.test(code[i])) {
      const start = i
      while (i < code.length && /[\w-]/.test(code[i])) i++
      const word = code.slice(start, i)
      // Look ahead for ":"
      const rest = code.slice(i)
      if (/^\s*:/.test(rest) && !rest.startsWith('://')) {
        tokens.push({ type: 'property', text: word })
      } else if (word.startsWith('@')) {
        tokens.push({ type: 'keyword', text: word })
      } else {
        addPlain(word)
      }
      continue
    }
    addPlain(code[i])
    i++
  }

  // Render tokens to HTML
  const colorMap: Record<Token['type'], string> = {
    comment: 'text-gray-400 italic',
    string: 'text-emerald-600',
    keyword: 'text-purple-600 font-medium',
    builtin: 'text-blue-600',
    number: 'text-amber-600',
    tag: 'text-rose-600',
    property: 'text-blue-600',
    plain: '',
  }
  return tokens.map(t => {
    const escaped = t.type === 'plain' ? esc(t.text) : esc(t.text)
    return t.type === 'plain' ? escaped : `<span class="${colorMap[t.type]}">${escaped}</span>`
  }).join('')
}

let _codeBlockId = 0
function renderMarkdown(text: string): string {
  // Phase 1: Extract code blocks (prevent them from being processed by other rules)
  const codeBlocks: string[] = []
  let processed = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang: string, code: string) => {
    const id = `code-block-${++_codeBlockId}`
    const label = LANG_LABELS[lang] || lang || 'Code'
    const highlighted = lang ? highlightCode(code.trimEnd(), lang) : code.trimEnd().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const html = `<div class="code-block-wrapper relative group/code my-2 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div class="flex items-center justify-between px-3 py-1 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
        <span class="text-[10px] font-medium text-gray-400 uppercase tracking-wider">${label}</span>
        <button onclick="navigator.clipboard.writeText(document.getElementById('${id}').textContent).then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)})" class="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700">Copy</button>
      </div>
      <pre class="bg-gray-50/50 dark:bg-gray-900/50 text-gray-800 dark:text-gray-200 p-3 overflow-x-auto text-[12px] font-mono leading-relaxed"><code id="${id}">${highlighted}</code></pre>
    </div>`
    codeBlocks.push(html)
    return `%%CODEBLOCK_${codeBlocks.length - 1}%%`
  })

  // Phase 2: Tables — convert markdown tables to HTML
  processed = processed.replace(/^(\|.+\|)\n(\|[\s:|-]+\|)\n((?:\|.+\|\n?)+)/gm,
    (_match, headerRow: string, _separator: string, bodyRows: string) => {
      const headers = headerRow.split('|').slice(1, -1).map((h: string) => h.trim())
      const rows = bodyRows.trim().split('\n').map((row: string) => row.split('|').slice(1, -1).map((c: string) => c.trim()))
      return `<table class="w-full text-[12px] my-2 border-collapse border border-gray-200 dark:border-gray-700">
        <thead><tr>${headers.map((h: string) => `<th class="px-2 py-1 text-left bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-semibold">${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((cells: string[]) => `<tr>${cells.map((c: string) => `<td class="px-2 py-1 border border-gray-200 dark:border-gray-700">${c}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`
    })

  // Phase 3: Blockquotes
  processed = processed.replace(/^(?:&gt;|>) (.+)$/gm, '<blockquote class="border-l-2 border-gray-300 dark:border-gray-600 pl-3 my-1 text-gray-500 dark:text-gray-400 italic text-[13px]">$1</blockquote>')
  // Merge adjacent blockquotes
  processed = processed.replace(/<\/blockquote>\n<blockquote[^>]*>/g, '<br/>')

  // Phase 4: Horizontal rules
  processed = processed.replace(/^(?:---|\*\*\*|___)\s*$/gm, '<hr class="my-3 border-gray-200 dark:border-gray-700" />')

  // Phase 5: Inline and block formatting
  processed = processed
    .replace(/`([^`]+)`/g, '<code class="bg-indigo-50/80 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded text-[12px] font-mono text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 class="text-[13px] font-bold mt-3 mb-1 text-gray-800 dark:text-gray-200">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-sm font-bold mt-3 mb-1.5 text-gray-900 dark:text-gray-100">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-900 dark:text-gray-100">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 pl-1 list-decimal text-[13px] leading-relaxed">$1</li>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 pl-1 list-disc text-[13px] leading-relaxed">$1</li>')
    .replace(/\n\n/g, '</p><p class="mt-1.5">')
    .replace(/\n/g, '<br/>')

  // Phase 6: Restore code blocks
  processed = processed.replace(/%%CODEBLOCK_(\d+)%%/g, (_m, idx) => codeBlocks[parseInt(idx)] || '')

  return processed
}

// DOM-based sanitizer using DOMPurify — far more robust than regex against XSS

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'div', 'span', 'p', 'br', 'hr', 'pre', 'code', 'button',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'em', 'b', 'i', 'u', 's',
    'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'blockquote', 'a', 'img',
  ],
  ALLOWED_ATTR: [
    'class', 'id', 'style', 'href', 'src', 'alt', 'title', 'target', 'rel',
    'onclick', // only for our copy buttons; DOMPurify hooks below further restrict this
  ],
  ALLOW_DATA_ATTR: false,
}

function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') {
    // SSR fallback: basic regex strip (DOMPurify needs a DOM)
    return html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
      .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/javascript\s*:/gi, '')
  }
  // Only allow onclick on buttons with our specific clipboard pattern
  DOMPurify.addHook('uponSanitizeAttribute', (node: Element, data) => {
    if (data.attrName === 'onclick') {
      const val = String(data.attrValue || '')
      if (node.tagName !== 'BUTTON' || !val.startsWith('navigator.clipboard')) {
        data.keepAttr = false
      }
    }
  })
  const clean = DOMPurify.sanitize(html, PURIFY_CONFIG)
  DOMPurify.removeHook('uponSanitizeAttribute')
  return clean
}

// Markdown HTML cache — avoids re-parsing identical text on every render
const _mdCache = new Map<string, string>()
function cachedRenderMarkdown(text: string): string {
  let html = _mdCache.get(text)
  if (html) return html
  html = sanitizeHtml(renderMarkdown(text))
  _mdCache.set(text, html)
  if (_mdCache.size > 300) _mdCache.delete(_mdCache.keys().next().value!)
  return html
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
    case 'grep_files': return data ? `${data.count || 0} matches for /${args.pattern}/` : `Grepping /${args.pattern}/...`
    case 'add_dependency': return data?.ok ? (data.skipped ? `${args.name} already installed` : `Added ${args.name}@${data.version}`) : `Adding ${args.name}...`
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
    case 'cancel_task': return data?.ok ? 'Task cancelled' : 'Cancelling...'
    case 'mcp_list_servers': return data ? `${(data as any).count || 0} servers` : 'Listing...'
    case 'mcp_connect_server': return args.serverName ? `${args.serverName}` : 'Connecting...'
    case 'mcp_call_tool': return args.toolName ? `${args.serverName}/${args.toolName}` : 'Calling...'
    case 'forge_check_npm_package': return args.packageName ? `${args.packageName}` : 'Checking...'
    case 'forge_revert_commit': return data?.ok ? 'Commit reverted' : 'Reverting...'
    case 'forge_create_branch': return args.branchName ? `${args.branchName}` : 'Creating...'
    case 'forge_create_pr': return data?.url ? `PR created` : 'Creating PR...'
    case 'forge_merge_pr': return data?.ok ? 'PR merged' : 'Merging...'
    case 'forge_deployment_status': return data?.state ? `${data.state}` : 'Checking...'
    case 'forge_check_build': return data?.ok ? 'Build passed' : (data?.error ? 'Build failed' : 'Building...')
    case 'forge_list_branches': return data ? `${(data as any).count || 0} branches` : 'Listing...'
    case 'forge_delete_branch': return data?.ok ? 'Branch deleted' : 'Deleting...'
    case 'forge_read_deploy_log': return data ? 'Log retrieved' : 'Reading...'
    case 'db_introspect': return args.table ? `${args.table}` : 'Inspecting...'
    case 'scaffold_component': return args.name ? `${args.name}` : 'Scaffolding...'
    case 'generate_env_file': return data?.ok ? '.env.example created' : 'Generating...'
    case 'request_env_vars': return 'Environment setup'
    case 'start_sandbox': return data?.ok ? 'Sandbox started' : 'Starting...'
    case 'stop_sandbox': return data?.ok ? 'Sandbox stopped' : 'Stopping...'
    case 'sandbox_status': return data?.running ? 'Running' : 'Checking...'
    case 'add_image': return args.query ? `"${String(args.query).slice(0, 30)}"` : 'Finding image...'
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
        // Server no longer returns content (token optimization) — apply edit client-side
        const oldStr = args.old_string as string
        const newStr = args.new_string as string
        const current = currentFiles[path]
        if (current && typeof oldStr === 'string' && typeof newStr === 'string') {
          if (current.includes(oldStr)) {
            return { updates: { [path]: current.replace(oldStr, newStr) } }
          }
          // Indent-insensitive fallback: match server behavior for pass 2
          const normLine = (l: string) => l.trim()
          const currentLines = current.split('\n')
          const oldLines = oldStr.split('\n').map(normLine).filter(l => l.length > 0)
          if (oldLines.length > 0) {
            for (let i = 0; i < currentLines.length; i++) {
              if (normLine(currentLines[i]) !== oldLines[0]) continue
              let fi = i, oi = 0, matched = true
              while (oi < oldLines.length && fi < currentLines.length) {
                if (normLine(currentLines[fi]) === '') { fi++; continue }
                if (normLine(currentLines[fi]) === oldLines[oi]) { oi++; fi++ }
                else { matched = false; break }
              }
              if (matched && oi === oldLines.length) {
                const before = currentLines.slice(0, i).join('\n')
                const after = currentLines.slice(fi).join('\n')
                const updated = [before, newStr, after].filter(s => s !== '').join('\n')
                return { updates: { [path]: updated } }
              }
            }
          }
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
        // Filter to only string values to prevent non-string data in VirtualFS
        const raw = inv.result.allFiles as Record<string, unknown>
        const safe: Record<string, string> = {}
        for (const [k, v] of Object.entries(raw)) {
          if (typeof v === 'string') safe[k] = v
        }
        return Object.keys(safe).length > 0 ? { updates: safe } : null
      }
      return null

    default:
      return null
  }
}

// ═══════════════════════════════════════════════════════════════════
// Env Var Input Card — inline credential input like v0
// ═══════════════════════════════════════════════════════════════════

function EnvVarInputCard({
  variables,
  savedVars,
  onSave,
}: {
  variables: Array<{ name: string; description?: string; required?: boolean }>
  savedVars: Record<string, string>
  onSave: (vars: Record<string, string>) => void
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const v of variables) {
      initial[v.name] = savedVars[v.name] || ''
    }
    return initial
  })
  const [saved, setSaved] = useState(false)

  const allRequiredFilled = variables
    .filter(v => v.required !== false)
    .every(v => values[v.name]?.trim())

  const handleSave = () => {
    const trimmed: Record<string, string> = {}
    for (const [k, v] of Object.entries(values)) {
      if (v.trim()) trimmed[k] = v.trim()
    }
    onSave(trimmed)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 text-[11px]">
      <div className="flex items-center gap-1.5 mb-2">
        <Key className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
        <span className="font-medium text-amber-600 dark:text-amber-400">Environment Variables Required</span>
      </div>
      <div className="space-y-2">
        {variables.map((v) => (
          <div key={v.name}>
            <div className="flex items-center gap-1 mb-0.5">
              <code className="text-[10px] font-mono text-amber-700 dark:text-amber-300 font-medium">{v.name}</code>
              {v.required !== false && <span className="text-red-500 text-[9px]">*</span>}
            </div>
            {v.description && (
              <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70 mb-0.5">{v.description}</p>
            )}
            <input
              type={v.name.toLowerCase().includes('secret') || v.name.toLowerCase().includes('key') || v.name.toLowerCase().includes('password') || v.name.toLowerCase().includes('token') ? 'password' : 'text'}
              value={values[v.name] || ''}
              onChange={(e) => setValues(prev => ({ ...prev, [v.name]: e.target.value }))}
              placeholder={v.name}
              className="w-full px-2 py-1 rounded bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-700 text-[11px] font-mono text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
          </div>
        ))}
      </div>
      <button
        onClick={handleSave}
        disabled={!allRequiredFilled}
        className={cn(
          'mt-2.5 px-3 py-1 rounded text-[11px] font-medium transition-colors',
          saved
            ? 'bg-emerald-500 text-white'
            : allRequiredFilled
              ? 'bg-amber-500 hover:bg-amber-600 text-white cursor-pointer'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
        )}
      >
        {saved ? 'Saved!' : 'Save Environment Variables'}
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Collapsible tool group — groups consecutive completed tool chips
// ═══════════════════════════════════════════════════════════════════

// Tools that get special rendering and should NOT be grouped
const SPECIAL_TOOLS = new Set([
  'think', 'suggest_improvement', 'request_env_vars',
  'deploy_to_vercel', 'check_task_status',
])

interface ToolGroup {
  type: 'tool-group'
  tools: Array<{ toolName: string; args: Record<string, unknown>; result: unknown; partIdx: number }>
}

/** Group consecutive completed standard tool invocations into collapsible groups */
function groupToolInvocations(parts: Array<{ type: string; text?: string; toolInvocation?: ToolInvocation }>) {
  type RenderItem =
    | { type: 'part'; part: typeof parts[0]; partIdx: number }
    | ToolGroup

  const items: RenderItem[] = []
  let currentGroup: ToolGroup['tools'] = []

  const flushGroup = () => {
    if (currentGroup.length >= 3) {
      items.push({ type: 'tool-group', tools: [...currentGroup] })
    } else {
      // Not enough to group — render individually
      for (const t of currentGroup) {
        items.push({ type: 'part', part: { type: 'tool-invocation', toolInvocation: { toolName: t.toolName, args: t.args, result: t.result, state: 'result' } as any }, partIdx: t.partIdx })
      }
    }
    currentGroup = []
  }

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const inv = part.toolInvocation

    // Check if this is a groupable tool: completed, no error, not special
    const isGroupable = part.type === 'tool-invocation'
      && inv
      && inv.state === 'result'
      && !SPECIAL_TOOLS.has(inv.toolName)
      && !(inv.result && typeof inv.result === 'object' && 'error' in (inv.result as object))

    if (isGroupable && inv) {
      currentGroup.push({ toolName: inv.toolName, args: inv.args || {}, result: inv.result, partIdx: i })
    } else {
      flushGroup()
      items.push({ type: 'part', part, partIdx: i })
    }
  }
  flushGroup()

  return items
}

function CollapsibleToolGroup({ tools }: { tools: ToolGroup['tools'] }) {
  const [expanded, setExpanded] = useState(false)

  // Build summary: "Wrote 3 files, edited 1, read 2"
  const counts: Record<string, number> = {}
  for (const t of tools) {
    const verb = t.toolName === 'write_file' ? 'Wrote'
      : t.toolName === 'read_file' ? 'Read'
      : t.toolName === 'edit_file' ? 'Edited'
      : t.toolName === 'delete_file' ? 'Deleted'
      : t.toolName === 'create_project' ? 'Scaffolded'
      : t.toolName === 'rename_file' ? 'Renamed'
      : t.toolName === 'list_files' ? 'Listed'
      : t.toolName === 'search_files' ? 'Searched'
      : t.toolName === 'grep_files' ? 'Grepped'
      : t.toolName === 'save_project' ? 'Saved'
      : t.toolName.startsWith('github_') ? 'GitHub op'
      : t.toolName.startsWith('db_') ? 'DB op'
      : t.toolName.startsWith('forge_') ? 'Forge op'
      : t.toolName.replace(/_/g, ' ')
    counts[verb] = (counts[verb] || 0) + 1
  }
  const summaryParts = Object.entries(counts).map(([verb, count]) => {
    const noun = verb === 'Wrote' || verb === 'Read' || verb === 'Edited' || verb === 'Deleted' || verb === 'Renamed' || verb === 'Listed'
      ? (count === 1 ? 'file' : 'files')
      : verb === 'Scaffolded' ? (count === 1 ? 'project' : 'projects')
      : verb === 'Searched' || verb === 'Grepped' ? (count === 1 ? 'search' : 'searches')
      : verb === 'Saved' ? (count === 1 ? 'project' : 'projects')
      : ''
    return `${verb} ${count}${noun ? ` ${noun}` : ''}`
  })
  const summaryText = summaryParts.join(', ')

  return (
    <div className="border border-forge-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-2.5 py-1.5 text-[11px] text-forge-text-dim hover:bg-forge-surface/50 transition-colors"
      >
        <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
        <span className="flex-1 text-left truncate">{summaryText}</span>
        <span className="text-[10px] text-forge-text-dim/60">{tools.length} tools</span>
        <ChevronDown className={cn('w-3 h-3 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="border-t border-forge-border space-y-1 p-1.5">
          {tools.map((t) => {
            const info = TOOL_LABELS[t.toolName] || { label: t.toolName.replace(/_/g, ' '), Icon: Terminal, color: 'gray' }
            const summary = getToolSummary(t.toolName, t.args, t.result)
            return (
              <div
                key={t.partIdx}
                className="flex items-center gap-2 px-2 py-1 rounded text-[11px] bg-forge-surface/50"
              >
                <div className={cn('w-4 h-4 rounded flex items-center justify-center shrink-0', colorClasses[info.color] || colorClasses.gray)}>
                  <info.Icon className="w-2.5 h-2.5" />
                </div>
                <span className="truncate flex-1 text-forge-text-dim">{summary}</span>
                <CheckCircle className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Memoized message component — prevents re-rendering completed
// messages when new content streams in
// ═══════════════════════════════════════════════════════════════════

interface MessageItemProps {
  message: { id: string; role: string; content: string; parts?: Array<{ type: string; text?: string; toolInvocation?: ToolInvocation }> }
  copiedId: string | null
  isEditing: boolean
  editingContent: string
  isLoading: boolean
  envVars: Record<string, string>
  onCopy: (id: string, content: string) => void
  onEditMessage: (id: string, content: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onSetEditingContent: (content: string) => void
  onRegenerate: (id: string) => void
  onEnvVarsSave: (vars: Record<string, string>) => void
  onCancelTask: (taskId: string) => void
}

const MessageItem = memo(function MessageItem({
  message, copiedId, isEditing, editingContent, isLoading, envVars,
  onCopy, onEditMessage, onSaveEdit, onCancelEdit, onSetEditingContent, onRegenerate, onEnvVarsSave, onCancelTask,
}: MessageItemProps) {
  const isUser = message.role === 'user'
  const textContent = typeof message.content === 'string' ? message.content : ''
  const parts = (message as any).parts as Array<{ type: string; text?: string; toolInvocation?: ToolInvocation }> | undefined

  return (
    <div className={cn('animate-fade-in', isUser ? 'flex justify-end' : '')}>
      {isUser ? (
        isEditing ? (
          <div className="max-w-[85%] w-full">
            <textarea
              value={editingContent}
              onChange={e => onSetEditingContent(e.target.value)}
              className="w-full bg-forge-surface border border-forge-accent/50 rounded-xl px-3.5 py-2.5 text-sm text-forge-text outline-none resize-none"
              rows={3}
              autoFocus
            />
            <div className="flex justify-end gap-1.5 mt-1">
              <button onClick={onCancelEdit} className="px-2 py-1 text-[10px] text-forge-text-dim hover:text-forge-text rounded transition-colors">Cancel</button>
              <button onClick={onSaveEdit} className="px-2 py-1 text-[10px] font-medium text-white bg-forge-accent rounded hover:bg-forge-accent-hover transition-colors">Resend</button>
            </div>
          </div>
        ) : (
          <div className="group/user flex items-start gap-1 max-w-[85%]">
            <div className="flex flex-col gap-0.5 opacity-0 group-hover/user:opacity-100 transition-all mt-1.5">
              <button
                onClick={() => onCopy(message.id, textContent)}
                className="p-1 rounded text-forge-text-dim hover:text-forge-text hover:bg-forge-surface"
                title="Copy"
              >
                {copiedId === message.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              </button>
              <button
                onClick={() => onEditMessage(message.id, textContent)}
                className="p-1 rounded text-forge-text-dim hover:text-forge-text hover:bg-forge-surface"
                title="Edit message"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
            <div className="px-3.5 py-2.5 rounded-2xl rounded-br-sm bg-forge-accent text-sm text-white shadow-sm">
              {textContent}
            </div>
          </div>
        )
      ) : parts && parts.length > 0 ? (
        /* Render parts in order — text and tool calls interleaved */
        <div className="space-y-1.5 group/assistant">
          {(() => {
          // Pre-compute: find the LAST check_task_status index so we can collapse all earlier ones
          let lastCheckIdx = -1
          for (let i = parts.length - 1; i >= 0; i--) {
            if (parts[i].type === 'tool-invocation' && parts[i].toolInvocation?.toolName === 'check_task_status') {
              lastCheckIdx = i
              break
            }
          }

          // Filter out collapsed check_task_status first
          const filteredParts = parts.filter((part, idx) => {
            if (part.type === 'tool-invocation' && part.toolInvocation?.toolName === 'check_task_status') {
              return idx === lastCheckIdx
            }
            return true
          })

          // Group consecutive completed tool invocations
          const grouped = groupToolInvocations(filteredParts)

          return grouped.map((item, itemIdx) => {
            // ── Collapsed tool group ──
            if (item.type === 'tool-group') {
              return <CollapsibleToolGroup key={`group-${itemIdx}`} tools={item.tools} />
            }

            const { part, partIdx } = item
            if (part.type === 'text' && part.text) {
              return (
                <div key={partIdx} className="relative group">
                  <div
                    className="text-sm sm:text-[13px] leading-relaxed text-gray-700 dark:text-gray-300 [&_pre]:my-2 [&_code]:text-xs sm:[&_code]:text-[12px]"
                    dangerouslySetInnerHTML={{ __html: cachedRenderMarkdown(part.text) }}
                  />
                  <button
                    onClick={() => onCopy(`${message.id}-${partIdx}`, part.text!)}
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
              const resultData = (inv.result && typeof inv.result === 'object') ? inv.result as Record<string, unknown> : null

              // ── Think panel ──
              if (inv.toolName === 'think' && inv.state === 'result') {
                const planFiles = Array.isArray(inv.args?.files) ? inv.args.files as string[] : []
                return (
                  <div key={partIdx} className="border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 rounded-lg p-2.5 text-[11px]">
                    <div className="flex items-center gap-1.5 mb-1.5 text-purple-600 dark:text-purple-400">
                      <Brain className="w-3.5 h-3.5" />
                      <span className="font-medium">Planning</span>
                    </div>
                    <div className="text-purple-700 dark:text-purple-300 leading-relaxed whitespace-pre-wrap">
                      {String(inv.args?.plan || '').slice(0, 300)}
                    </div>
                    {planFiles.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {planFiles.map((f: string, fi: number) => (
                          <span key={fi} className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 rounded text-[10px] font-mono">{f}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              }

              // ── Suggest improvement panel ──
              if (inv.toolName === 'suggest_improvement' && inv.state === 'result') {
                const sArgs = (inv.args || {}) as Record<string, string>
                const priority = sArgs.priority || 'medium'
                const priorityColor = priority === 'high' ? 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/40' : priority === 'medium' ? 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40' : 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/40'
                return (
                  <div key={partIdx} className="border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2.5 text-[11px]">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span className="font-medium text-amber-600 dark:text-amber-400">Improvement Suggestion</span>
                      <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-medium uppercase', priorityColor)}>{priority}</span>
                    </div>
                    <p className="text-amber-700 dark:text-amber-300 mb-1">{sArgs.issue || ''}</p>
                    {sArgs.suggestion && (
                      <pre className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded p-2 mt-1 whitespace-pre-wrap font-mono">{sArgs.suggestion}</pre>
                    )}
                    {sArgs.file && (
                      <span className="inline-block mt-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded text-[10px] font-mono">{sArgs.file}</span>
                    )}
                  </div>
                )
              }

              // ── Environment Variables input card ──
              if (inv.toolName === 'request_env_vars' && inv.state === 'result') {
                const variables = (inv.result && typeof inv.result === 'object' && 'variables' in inv.result)
                  ? (inv.result as { variables: Array<{ name: string; description?: string; required?: boolean }> }).variables
                  : []
                if (variables.length > 0) {
                  return (
                    <EnvVarInputCard
                      key={partIdx}
                      variables={variables}
                      savedVars={envVars}
                      onSave={onEnvVarsSave}
                    />
                  )
                }
              }

              // ── Deploy success card with clickable URL ──
              const deployUrl = resultData?.url as string | undefined
              const isDeployTool = inv.toolName === 'deploy_to_vercel' || inv.toolName === 'check_task_status'
              const taskStatus = resultData?.status as string | undefined
              const isTaskCompleted = inv.toolName === 'check_task_status' && taskStatus === 'completed'
              const isTaskRunning = inv.toolName === 'check_task_status' && taskStatus === 'running'
              const isTaskFailed = inv.toolName === 'check_task_status' && taskStatus === 'failed'

              if (isDeployTool && !isRunning && deployUrl && !hasError) {
                return (
                  <div key={partIdx} className="border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3 text-[11px]">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">
                        {inv.toolName === 'deploy_to_vercel' ? 'Deployed successfully' : `${String(resultData?.type || 'Task')} completed`}
                      </span>
                    </div>
                    <a
                      href={deployUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[11px] text-forge-accent hover:underline font-mono break-all"
                    >
                      {deployUrl}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                )
              }

              // ── check_task_status: running → blue progress indicator with cancel ──
              if (inv.toolName === 'check_task_status' && (isRunning || isTaskRunning)) {
                const taskProgress = resultData?.progress as string | undefined
                const taskCreatedAt = resultData?.created_at ? new Date(resultData.created_at as string).getTime() : 0
                const taskElapsed = taskCreatedAt ? Math.floor((Date.now() - taskCreatedAt) / 1000) : 0
                const runningTaskId = resultData?.id as string | undefined
                return (
                  <div
                    key={partIdx}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 animate-shimmer"
                  >
                    <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50">
                      <Loader2 className="w-3 h-3 animate-spin" />
                    </div>
                    <span className="truncate flex-1 text-blue-600 dark:text-blue-400">
                      {taskProgress || `${resultData?.type || 'Task'}: in progress...`}
                      {taskElapsed > 0 && ` · ${taskElapsed}s`}
                    </span>
                    {runningTaskId && (
                      <button
                        onClick={() => onCancelTask(runningTaskId)}
                        className="shrink-0 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/50 text-blue-400 hover:text-red-500 transition-colors"
                        title="Cancel task"
                      >
                        <StopCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )
              }

              // ── check_task_status: failed → red error with actionable message ──
              if (isTaskFailed) {
                const rawError = resultData?.error ? String(resultData.error) : ''
                const friendlyError = rawError.includes('rate limit') ? 'GitHub rate limit hit — wait a few minutes and retry'
                  : rawError.includes('timed out') || rawError.includes('timeout') ? 'Operation timed out — try again'
                  : rawError.includes('401') || rawError.includes('auth') ? 'Authentication failed — check your credentials'
                  : rawError.includes('404') || rawError.includes('not found') ? 'Resource not found — check the URL or repo name'
                  : rawError.includes('ENOTFOUND') || rawError.includes('network') ? 'Network error — check your connection'
                  : rawError.includes('Cancelled') ? 'Cancelled by user'
                  : rawError.slice(0, 100)
                return (
                  <div
                    key={partIdx}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30"
                  >
                    <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/50">
                      <XCircle className="w-3 h-3" />
                    </div>
                    <span className="truncate flex-1 text-red-600 dark:text-red-400" title={rawError}>
                      {`${resultData?.type || 'Task'}: ${friendlyError || 'failed'}`}
                    </span>
                  </div>
                )
              }

              // ── check_task_status: completed without URL ──
              if (isTaskCompleted) {
                return (
                  <div
                    key={partIdx}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30"
                  >
                    <div className="w-5 h-5 rounded flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/50">
                      <CheckCircle className="w-3 h-3" />
                    </div>
                    <span className="truncate flex-1 text-emerald-600 dark:text-emerald-400">
                      {`${resultData?.type || 'Task'}: completed`}
                    </span>
                  </div>
                )
              }

              // ── Default tool chip ──
              return (
                <div
                  key={partIdx}
                  className={cn(
                    'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] border transition-all',
                    isRunning ? 'border-forge-border animate-shimmer'
                      : hasError ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30'
                      : 'border-forge-border bg-forge-surface/50',
                  )}
                >
                  <div className={cn('w-5 h-5 rounded flex items-center justify-center shrink-0', colorClasses[info.color] || colorClasses.gray)}>
                    {isRunning ? <Loader2 className="w-3 h-3 animate-spin" />
                      : hasError ? <XCircle className="w-3 h-3 text-red-600 dark:text-red-400" />
                      : <info.Icon className="w-3 h-3" />}
                  </div>
                  <span className={cn('truncate flex-1', hasError ? 'text-red-600 dark:text-red-400' : 'text-forge-text-dim')}>
                    {summary}
                  </span>
                  {!isRunning && !hasError && <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />}
                </div>
              )
            }

            return null
          })
        })()}
          {!isLoading && (
            <button
              onClick={() => onRegenerate(message.id)}
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
                className="text-sm sm:text-[13px] leading-relaxed text-gray-700 dark:text-gray-300 [&_pre]:my-2 [&_code]:text-xs sm:[&_code]:text-[12px]"
                dangerouslySetInnerHTML={{ __html: cachedRenderMarkdown(textContent) }}
              />
              <button
                onClick={() => onCopy(message.id, textContent)}
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
              onClick={() => onRegenerate(message.id)}
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
}, (prev, next) => {
  // Custom comparator: skip re-render if nothing meaningful changed for THIS message
  if (prev.message.id !== next.message.id) return false
  if (prev.message.content !== next.message.content) return false
  // Parts changed? (tool invocations updating from call → result)
  const pp = prev.message.parts
  const np = next.message.parts
  if ((pp?.length || 0) !== (np?.length || 0)) return false
  if (pp && np) {
    for (let i = 0; i < pp.length; i++) {
      if (pp[i]?.toolInvocation?.state !== np[i]?.toolInvocation?.state) return false
      if (pp[i]?.text !== np[i]?.text) return false
    }
  }
  // copiedId: only re-render if it affects THIS message
  const prevCopied = prev.copiedId !== null && prev.copiedId.startsWith(prev.message.id)
  const nextCopied = next.copiedId !== null && next.copiedId.startsWith(next.message.id)
  if (prevCopied !== nextCopied) return false
  if (prevCopied && prev.copiedId !== next.copiedId) return false
  // Editing state
  if (prev.isEditing !== next.isEditing) return false
  if (prev.isEditing && prev.editingContent !== next.editingContent) return false
  if (prev.isLoading !== next.isLoading) return false
  if (prev.envVars !== next.envVars) return false
  return true
})

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
  activeFile?: string | null
}

export function ChatPanel({ projectName, projectId, files, onFileChange, onFileDelete, onBulkFileUpdate, githubToken, onRegisterSend, pendingMessage, onPendingMessageSent, activeFile }: ChatPanelProps) {
  const [selectedModel, setSelectedModel] = useState<string>(MODEL_OPTIONS[0].id)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [envVars, setEnvVars] = useState<Record<string, string>>({})

  const {
    messages,
    setMessages,
    stop,
    isLoading,
    error,
    append,
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

  // Escape to stop generation
  useEffect(() => {
    if (!isLoading) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); stop() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isLoading, stop])

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

  const handleEnvVarsSave = useCallback((vars: Record<string, string>) => {
    setEnvVars(prev => ({ ...prev, ...vars }))
    // Write .env.local to VirtualFS so it appears in the file tree
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
      // Fallback: ask AI to cancel
      append({ role: 'user', content: `Cancel the running task with ID: ${taskId}` })
    }
  }, [append])

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

  // Extract real token usage from stream data annotations
  const realTokens = useMemo(() => {
    if (!data || !Array.isArray(data)) return 0
    const usageEntries = data.filter((d: unknown) => d && typeof d === 'object' && (d as Record<string, unknown>).type === 'usage')
    if (usageEntries.length === 0) return 0
    const last = usageEntries[usageEntries.length - 1] as Record<string, unknown>
    return (last?.totalTokens as number) || 0
  }, [data])

  // Elapsed time tracking during AI operations
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

  const formatElapsed = (s: number) => {
    if (s < 60) return `${s}s`
    return `${Math.floor(s / 60)}m ${s % 60}s`
  }

  const isEmpty = messages.length === 0

  return (
    <ErrorBoundary>
    <div className="h-full flex flex-col bg-forge-panel border-r border-forge-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-forge-border shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-forge-accent" />
          <span className="text-xs font-medium text-forge-text">Forge AI</span>
          {isLoading && (
            <span className="text-[10px] text-forge-accent animate-pulse flex items-center gap-1" title="Tool invocations processed">
              {stepCount > 0 && <>Step {stepCount}</>}
              {elapsed > 0 && <><Clock className="w-2.5 h-2.5 inline" />{formatElapsed(elapsed)}</>}
            </span>
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
            {messages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                copiedId={copiedId}
                isEditing={editingMessageId === message.id}
                editingContent={editingContent}
                isLoading={isLoading}
                envVars={envVars}
                onCopy={handleCopy}
                onEditMessage={handleEditMessage}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={() => setEditingMessageId(null)}
                onSetEditingContent={setEditingContent}
                onRegenerate={handleRegenerate}
                onEnvVarsSave={handleEnvVarsSave}
                onCancelTask={handleCancelTask}
              />
            ))}

            {isLoading && (
              <div className="flex items-center gap-3 text-xs py-3 px-2 animate-fade-in">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-forge-accent animate-pulse-dot" />
                  <div className="w-1.5 h-1.5 rounded-full bg-forge-accent animate-pulse-dot" style={{ animationDelay: '0.2s' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-forge-accent animate-pulse-dot" style={{ animationDelay: '0.4s' }} />
                </div>
                <span className="text-forge-text-dim">
                  {stepCount > 0 ? `Building (step ${stepCount})` : 'Thinking'}
                  {elapsed > 0 && ` · ${formatElapsed(elapsed)}`}
                  ...
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
              e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
            }}
            placeholder={isEmpty ? 'Describe what you want to build...' : 'Ask for changes, new features, fixes...'}
            rows={3}
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
            Enter to send &middot; Shift+Enter for new line{isLoading ? ' · Esc to stop' : ''}
          </span>
          {(realTokens || estimatedTokens) > 0 && (
            <span className="text-[10px] text-forge-text-dim/60" title={realTokens ? 'Actual API token usage' : 'Estimated token usage'}>
              {realTokens ? '' : '~'}{(realTokens || estimatedTokens) > 1000 ? `${((realTokens || estimatedTokens) / 1000).toFixed(1)}k` : (realTokens || estimatedTokens)} tokens
            </span>
          )}
        </div>
      </div>
    </div>
    </ErrorBoundary>
  )
}
