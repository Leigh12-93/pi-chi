'use client'

import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react'
import { useChat } from '@ai-sdk/react'
import {
  Loader2, Copy, Check, Trash2,
  FileText, FolderPlus, GitBranch, Search,
  Terminal, Pencil, Eye, Globe, Rocket,
  AlertTriangle, CheckCircle, XCircle,
  StopCircle, Sparkles, ArrowUp, Lightbulb,
  Brain, Database, Wrench, RefreshCw,
  BookOpen, Save, Plug, ImageIcon, Package,
  ChevronDown, ChevronRight, ExternalLink, Clock, Key,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ErrorBoundary } from '@/components/error-boundary'
import DOMPurify from 'dompurify'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

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
  validate_file: { label: 'Validating file', Icon: CheckCircle, color: 'green' },
  check_coherence: { label: 'Checking coherence', Icon: Search, color: 'purple' },
  capture_preview: { label: 'Capturing preview', Icon: Eye, color: 'cyan' },
  generate_tests: { label: 'Generating tests', Icon: FileText, color: 'indigo' },
  check_dependency_health: { label: 'Checking package health', Icon: Package, color: 'yellow' },
  search_references: { label: 'Searching references', Icon: BookOpen, color: 'purple' },
  get_reference_code: { label: 'Loading reference', Icon: BookOpen, color: 'blue' },
  save_preference: { label: 'Saving preference', Icon: Save, color: 'green' },
  load_preferences: { label: 'Loading preferences', Icon: Database, color: 'blue' },
  set_custom_domain: { label: 'Setting domain', Icon: Globe, color: 'blue' },
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
// Markdown renderer — always-dark code blocks (v0 style)
// ═══════════════════════════════════════════════════════════════════

const LANG_LABELS: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TSX', js: 'JavaScript', jsx: 'JSX',
  css: 'CSS', html: 'HTML', json: 'JSON', md: 'Markdown',
  bash: 'Bash', sh: 'Shell', sql: 'SQL', py: 'Python',
  yaml: 'YAML', yml: 'YAML', xml: 'XML', graphql: 'GraphQL',
  typescript: 'TypeScript', javascript: 'JavaScript',
}

/**
 * Single-pass tokenizer-based code highlighter.
 * Colors tuned for dark backgrounds (v0 style).
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
    if ((isJS || isBash || isCSS) && (isJS || isCSS ? code[i] === '/' && code[i+1] === '/' : code[i] === '#')) {
      const start = i
      while (i < code.length && code[i] !== '\n') i++
      tokens.push({ type: 'comment', text: code.slice(start, i) })
      continue
    }
    if ((isJS || isCSS) && code[i] === '/' && code[i+1] === '*') {
      const start = i
      i += 2
      while (i < code.length && !(code[i-1] === '*' && code[i] === '/')) i++
      i++
      tokens.push({ type: 'comment', text: code.slice(start, i) })
      continue
    }
    if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
      const quote = code[i]
      const start = i
      i++
      while (i < code.length && code[i] !== quote) { if (code[i] === '\\') i++; i++ }
      i++
      tokens.push({ type: 'string', text: code.slice(start, i) })
      continue
    }
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
    if (isCSS && /[a-zA-Z-]/.test(code[i])) {
      const start = i
      while (i < code.length && /[\w-]/.test(code[i])) i++
      const word = code.slice(start, i)
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

  // Dark-bg color palette (v0 style)
  const colorMap: Record<Token['type'], string> = {
    comment: 'text-gray-500 italic',
    string: 'text-emerald-400',
    keyword: 'text-violet-400 font-medium',
    builtin: 'text-sky-400',
    number: 'text-amber-400',
    tag: 'text-rose-400',
    property: 'text-sky-400',
    plain: '',
  }
  return tokens.map(t => {
    const escaped = esc(t.text)
    return t.type === 'plain' ? escaped : `<span class="${colorMap[t.type]}">${escaped}</span>`
  }).join('')
}

let _codeBlockId = 0
function renderMarkdown(text: string): string {
  const codeBlocks: string[] = []
  let processed = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang: string, code: string) => {
    const id = `code-block-${++_codeBlockId}`
    const label = LANG_LABELS[lang] || lang || 'Code'
    const highlighted = lang ? highlightCode(code.trimEnd(), lang) : code.trimEnd().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // v0-style: always dark code blocks
    const html = `<div class="code-block-wrapper relative group/code my-3 rounded-xl overflow-hidden border border-gray-800">
      <div class="flex items-center justify-between px-3.5 py-2 bg-gray-900 border-b border-gray-800">
        <span class="text-[11px] font-medium text-gray-400 tracking-wide">${label}</span>
        <button onclick="navigator.clipboard.writeText(document.getElementById('${id}').textContent).then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)})" class="text-[11px] text-gray-500 hover:text-gray-300 transition-colors px-2 py-0.5 rounded hover:bg-gray-800">Copy</button>
      </div>
      <pre class="bg-gray-950 text-gray-200 p-4 overflow-x-auto text-[12.5px] font-mono leading-relaxed"><code id="${id}">${highlighted}</code></pre>
    </div>`
    codeBlocks.push(html)
    return `%%CODEBLOCK_${codeBlocks.length - 1}%%`
  })

  // Tables
  processed = processed.replace(/^(\|.+\|)\n(\|[\s:|-]+\|)\n((?:\|.+\|\n?)+)/gm,
    (_match, headerRow: string, _separator: string, bodyRows: string) => {
      const headers = headerRow.split('|').slice(1, -1).map((h: string) => h.trim())
      const rows = bodyRows.trim().split('\n').map((row: string) => row.split('|').slice(1, -1).map((c: string) => c.trim()))
      return `<table class="w-full text-[12.5px] my-3 border-collapse border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <thead><tr>${headers.map((h: string) => `<th class="px-3 py-1.5 text-left bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-300">${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((cells: string[]) => `<tr>${cells.map((c: string) => `<td class="px-3 py-1.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400">${c}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`
    })

  // Blockquotes
  processed = processed.replace(/^(?:&gt;|>) (.+)$/gm, '<blockquote class="border-l-2 border-gray-300 dark:border-gray-600 pl-3 my-1.5 text-gray-500 dark:text-gray-400 italic text-[13px]">$1</blockquote>')
  processed = processed.replace(/<\/blockquote>\n<blockquote[^>]*>/g, '<br/>')

  // Horizontal rules
  processed = processed.replace(/^(?:---|\*\*\*|___)\s*$/gm, '<hr class="my-4 border-gray-200 dark:border-gray-700" />')

  // Inline formatting
  processed = processed
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-[12.5px] font-mono text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 class="text-[13.5px] font-semibold mt-4 mb-1.5 text-gray-800 dark:text-gray-200">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-sm font-bold mt-4 mb-2 text-gray-900 dark:text-gray-100">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-900 dark:text-gray-100">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-5 pl-1 list-decimal text-[13.5px] leading-[1.7]">$1</li>')
    .replace(/^- (.+)$/gm, '<li class="ml-5 pl-1 list-disc text-[13.5px] leading-[1.7]">$1</li>')
    .replace(/\n\n/g, '</p><p class="mt-2">')
    .replace(/\n/g, '<br/>')

  // Restore code blocks
  processed = processed.replace(/%%CODEBLOCK_(\d+)%%/g, (_m, idx) => codeBlocks[parseInt(idx)] || '')

  return processed
}

// DOMPurify sanitization
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
    'onclick',
  ],
  ALLOW_DATA_ATTR: false,
}

if (typeof window !== 'undefined') {
  DOMPurify.addHook('uponSanitizeAttribute', (node: Element, data) => {
    if (data.attrName === 'onclick') {
      const val = String(data.attrValue || '')
      if (node.tagName !== 'BUTTON' || !val.startsWith('navigator.clipboard')) {
        data.keepAttr = false
      }
    }
  })
}

function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') {
    return html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
      .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/javascript\s*:/gi, '')
  }
  return DOMPurify.sanitize(html, PURIFY_CONFIG)
}

const _mdCache = new Map<string, string>()
function cachedRenderMarkdown(text: string): string {
  let html = _mdCache.get(text)
  if (html) return html
  html = sanitizeHtml(renderMarkdown(text))
  _mdCache.set(text, html)
  if (_mdCache.size > 300) {
    const firstKey = _mdCache.keys().next().value
    if (firstKey !== undefined) _mdCache.delete(firstKey)
  }
  return html
}

function getToolSummary(toolName: string, args: Record<string, unknown>, result: unknown): string {
  const data = (result && typeof result === 'object') ? result as Record<string, unknown> : null
  if (data?.error) return `Error: ${String(data.error).slice(0, 80)}`

  switch (toolName) {
    case 'think': return args.plan ? String(args.plan).slice(0, 100) + (String(args.plan).length > 100 ? '...' : '') : 'Planning...'
    case 'suggest_improvement': return args.issue ? `${args.priority}: ${String(args.issue).slice(0, 80)}` : 'Suggestion logged'
    case 'write_file': return args.path ? `${args.path}` : 'Writing...'
    case 'read_file': return args.path ? `${args.path}` : 'Reading...'
    case 'edit_file': return args.path ? `${args.path}` : 'Editing...'
    case 'delete_file': return args.path ? `${args.path}` : 'Deleting...'
    case 'create_project': return args.template ? `${args.template} template` : 'Scaffolding...'
    case 'github_create_repo': return args.repoName ? `${args.repoName}` : 'Creating...'
    case 'github_push_update': return data?.ok ? `${data.filesCount} files pushed` : 'Pushing...'
    case 'deploy_to_vercel': return data?.url ? `Live at ${data.url}` : 'Deploying...'
    case 'set_custom_domain': return data?.ok ? `${args.domain} configured` : (data?.error ? `Failed: ${String(data.error).slice(0, 60)}` : `Setting ${args.domain}...`)
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
        const oldStr = args.old_string as string
        const newStr = args.new_string as string
        const current = currentFiles[path]
        if (current && typeof oldStr === 'string' && typeof newStr === 'string') {
          if (current.includes(oldStr)) {
            return { updates: { [path]: current.replace(oldStr, newStr) } }
          }
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
// Env Var Input Card
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
    <div className="border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl p-3.5 text-[12px]">
      <div className="flex items-center gap-2 mb-2.5">
        <Key className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
        <span className="font-medium text-amber-700 dark:text-amber-400">Environment Variables Required</span>
      </div>
      <div className="space-y-2.5">
        {variables.map((v) => (
          <div key={v.name}>
            <div className="flex items-center gap-1 mb-1">
              <code className="text-[11px] font-mono text-amber-700 dark:text-amber-300 font-medium">{v.name}</code>
              {v.required !== false && <span className="text-red-500 text-[9px]">*</span>}
            </div>
            {v.description && (
              <p className="text-[11px] text-amber-600/70 dark:text-amber-400/70 mb-1">{v.description}</p>
            )}
            <input
              type={v.name.toLowerCase().includes('secret') || v.name.toLowerCase().includes('key') || v.name.toLowerCase().includes('password') || v.name.toLowerCase().includes('token') ? 'password' : 'text'}
              value={values[v.name] || ''}
              onChange={(e) => setValues(prev => ({ ...prev, [v.name]: e.target.value }))}
              placeholder={v.name}
              className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-700 text-[12px] font-mono text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
          </div>
        ))}
      </div>
      <button
        onClick={handleSave}
        disabled={!allRequiredFilled}
        className={cn(
          'mt-3 px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors',
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
// Collapsible tool group
// ═══════════════════════════════════════════════════════════════════

const SPECIAL_TOOLS = new Set([
  'think', 'suggest_improvement', 'request_env_vars',
  'deploy_to_vercel', 'check_task_status',
])

interface ToolGroup {
  type: 'tool-group'
  tools: Array<{ toolName: string; args: Record<string, unknown>; result: unknown; partIdx: number }>
}

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
      for (const t of currentGroup) {
        items.push({ type: 'part', part: { type: 'tool-invocation', toolInvocation: { toolName: t.toolName, args: t.args, result: t.result, state: 'result' } as any }, partIdx: t.partIdx })
      }
    }
    currentGroup = []
  }

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const inv = part.toolInvocation

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
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl overflow-hidden border border-forge-border"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-[12px] text-forge-text-dim hover:bg-forge-surface/50 transition-colors"
      >
        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        <span className="flex-1 text-left truncate">{summaryText}</span>
        <span className="text-[10px] text-forge-text-dim/50">{tools.length}</span>
        <ChevronDown className={cn('w-3 h-3 transition-transform duration-200', expanded && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-forge-border space-y-0.5 p-1.5">
              {tools.map((t) => {
                const info = TOOL_LABELS[t.toolName] || { label: t.toolName.replace(/_/g, ' '), Icon: Terminal, color: 'gray' }
                const summary = getToolSummary(t.toolName, t.args, t.result)
                return (
                  <div
                    key={t.partIdx}
                    className="flex items-center gap-2 px-2.5 py-1 rounded-lg text-[11px] hover:bg-forge-surface/80 transition-colors"
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
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Think Panel — v0-style collapsible "Thought for Xs"
// ═══════════════════════════════════════════════════════════════════

function ThinkPanel({ plan, files }: { plan: string; files: string[] }) {
  const [expanded, setExpanded] = useState(false)
  const planText = String(plan || '').slice(0, 500)

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl border border-forge-border overflow-hidden"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-[12px] hover:bg-forge-surface/50 transition-colors"
      >
        <Brain className="w-3.5 h-3.5 text-forge-text-dim shrink-0" />
        <span className="flex-1 text-left text-forge-text-dim font-medium">Thinking</span>
        <ChevronRight className={cn('w-3 h-3 text-forge-text-dim/50 transition-transform duration-200', expanded && 'rotate-90')} />
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="border-t border-forge-border px-3.5 py-2.5">
              <p className="text-[12px] text-forge-text-dim leading-relaxed whitespace-pre-wrap">{planText}</p>
              {files.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {files.map((f: string, fi: number) => (
                    <span key={fi} className="px-1.5 py-0.5 bg-forge-surface text-forge-text-dim rounded text-[10px] font-mono">{f}</span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Memoized message component
// ═══════════════════════════════════════════════════════════════════

interface MessageItemProps {
  message: { id: string; role: string; content: string; parts?: Array<{ type: string; text?: string; toolInvocation?: ToolInvocation }> }
  copiedId: string | null
  isEditing: boolean
  editingContent: string
  isLoading: boolean
  isLast: boolean
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
  message, copiedId, isEditing, editingContent, isLoading, isLast, envVars,
  onCopy, onEditMessage, onSaveEdit, onCancelEdit, onSetEditingContent, onRegenerate, onEnvVarsSave, onCancelTask,
}: MessageItemProps) {
  const isUser = message.role === 'user'
  const textContent = typeof message.content === 'string' ? message.content : ''
  const parts = (message as any).parts as Array<{ type: string; text?: string; toolInvocation?: ToolInvocation }> | undefined

  // Detect if the last text part is currently streaming (for blinking cursor)
  const showStreamingCursor = isLoading && isLast && !isUser

  return (
    <div className={cn('v0-message-in', isUser ? 'flex justify-end' : '')}>
      {isUser ? (
        isEditing ? (
          <div className="max-w-[85%] w-full">
            <textarea
              value={editingContent}
              onChange={e => onSetEditingContent(e.target.value)}
              className="w-full bg-forge-bg border border-forge-border rounded-xl px-3.5 py-2.5 text-[13.5px] text-forge-text outline-none resize-none focus:ring-2 focus:ring-forge-accent/20 focus:border-forge-accent/40 transition-all"
              rows={3}
              autoFocus
            />
            <div className="flex justify-end gap-1.5 mt-1.5">
              <button onClick={onCancelEdit} className="px-2.5 py-1 text-[11px] text-forge-text-dim hover:text-forge-text rounded-lg transition-colors">Cancel</button>
              <button onClick={onSaveEdit} className="px-2.5 py-1 text-[11px] font-medium text-white bg-forge-accent rounded-lg hover:bg-forge-accent-hover transition-colors">Resend</button>
            </div>
          </div>
        ) : (
          /* v0-style user message: subtle gray bubble, right-aligned */
          <div className="group/user flex items-start gap-1.5 max-w-[85%]">
            <div className="flex flex-col gap-0.5 opacity-0 group-hover/user:opacity-100 transition-all mt-1.5">
              <button
                onClick={() => onCopy(message.id, textContent)}
                className="p-1 rounded-md text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors"
                title="Copy"
              >
                {copiedId === message.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              </button>
              <button
                onClick={() => onEditMessage(message.id, textContent)}
                className="p-1 rounded-md text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors"
                title="Edit message"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
            <div className="px-4 py-2.5 rounded-2xl rounded-br-md bg-forge-surface border border-forge-border text-[13.5px] text-forge-text leading-relaxed">
              {textContent}
            </div>
          </div>
        )
      ) : parts && parts.length > 0 ? (
        /* Assistant message — clean text, no wrapper background */
        <div className="space-y-2 group/assistant">
          {(() => {
          let lastCheckIdx = -1
          for (let i = parts.length - 1; i >= 0; i--) {
            if (parts[i].type === 'tool-invocation' && parts[i].toolInvocation?.toolName === 'check_task_status') {
              lastCheckIdx = i
              break
            }
          }

          const filteredParts = parts.filter((part, idx) => {
            if (part.type === 'tool-invocation' && part.toolInvocation?.toolName === 'check_task_status') {
              return idx === lastCheckIdx
            }
            return true
          })

          const grouped = groupToolInvocations(filteredParts)

          // Find the last text part index for streaming cursor placement
          let lastTextItemIdx = -1
          for (let gi = grouped.length - 1; gi >= 0; gi--) {
            if (grouped[gi].type === 'part' && (grouped[gi] as any).part.type === 'text') {
              lastTextItemIdx = gi
              break
            }
          }

          return grouped.map((item, itemIdx) => {
            if (item.type === 'tool-group') {
              return <CollapsibleToolGroup key={`group-${itemIdx}`} tools={item.tools} />
            }

            const { part, partIdx } = item
            if (part.type === 'text' && part.text) {
              const isLastText = itemIdx === lastTextItemIdx
              return (
                <div key={partIdx} className="relative group">
                  <div
                    className={cn(
                      'text-[13.5px] leading-[1.7] text-forge-text [&_pre]:my-3 [&_code]:text-[12.5px]',
                      showStreamingCursor && isLastText && 'streaming-cursor'
                    )}
                    dangerouslySetInnerHTML={{ __html: cachedRenderMarkdown(part.text) }}
                  />
                  <button
                    onClick={() => onCopy(`${message.id}-${partIdx}`, part.text!)}
                    className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 sm:transition-opacity p-1.5 rounded-lg hover:bg-forge-surface"
                    aria-label="Copy message"
                    title="Copy"
                  >
                    {copiedId === `${message.id}-${partIdx}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-forge-text-dim" />}
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

              // Think panel — v0-style collapsible
              if (inv.toolName === 'think' && inv.state === 'result') {
                const planFiles = Array.isArray(inv.args?.files) ? inv.args.files as string[] : []
                return <ThinkPanel key={partIdx} plan={String(inv.args?.plan || '')} files={planFiles} />
              }

              // Suggest improvement panel
              if (inv.toolName === 'suggest_improvement' && inv.state === 'result') {
                const sArgs = (inv.args || {}) as Record<string, string>
                const priority = sArgs.priority || 'medium'
                const priorityColor = priority === 'high' ? 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/40' : priority === 'medium' ? 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40' : 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/40'
                return (
                  <motion.div
                    key={partIdx}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl p-3 text-[12px]"
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span className="font-medium text-amber-700 dark:text-amber-400">Suggestion</span>
                      <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-medium uppercase', priorityColor)}>{priority}</span>
                    </div>
                    <p className="text-amber-700 dark:text-amber-300 mb-1">{sArgs.issue || ''}</p>
                    {sArgs.suggestion && (
                      <pre className="text-[11px] bg-gray-950 text-gray-200 rounded-lg p-2.5 mt-1.5 whitespace-pre-wrap font-mono">{sArgs.suggestion}</pre>
                    )}
                    {sArgs.file && (
                      <span className="inline-block mt-1.5 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-forge-text-dim rounded text-[10px] font-mono">{sArgs.file}</span>
                    )}
                  </motion.div>
                )
              }

              // Environment Variables input card
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

              // Deploy success card
              const deployUrl = resultData?.url as string | undefined
              const isDeployTool = inv.toolName === 'deploy_to_vercel' || inv.toolName === 'check_task_status'
              const taskStatus = resultData?.status as string | undefined
              const isTaskCompleted = inv.toolName === 'check_task_status' && taskStatus === 'completed'
              const isTaskRunning = inv.toolName === 'check_task_status' && taskStatus === 'running'
              const isTaskFailed = inv.toolName === 'check_task_status' && taskStatus === 'failed'

              if (isDeployTool && !isRunning && deployUrl && !hasError) {
                return (
                  <motion.div
                    key={partIdx}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl p-3.5 text-[12px]"
                  >
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
                      className="flex items-center gap-1.5 text-[12px] text-forge-accent hover:underline font-mono break-all"
                    >
                      {deployUrl}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </motion.div>
                )
              }

              // Task running with cancel button
              if (inv.toolName === 'check_task_status' && (isRunning || isTaskRunning)) {
                const taskProgress = resultData?.progress as string | undefined
                const taskCreatedAt = resultData?.created_at ? new Date(resultData.created_at as string).getTime() : 0
                const taskElapsed = taskCreatedAt ? Math.floor((Date.now() - taskCreatedAt) / 1000) : 0
                const runningTaskId = resultData?.id as string | undefined
                return (
                  <motion.div
                    key={partIdx}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 animate-shimmer"
                  >
                    <div className="w-5 h-5 rounded-lg flex items-center justify-center shrink-0 text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50">
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
                  </motion.div>
                )
              }

              // Task failed
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
                  <motion.div
                    key={partIdx}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20"
                  >
                    <div className="w-5 h-5 rounded-lg flex items-center justify-center shrink-0 text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/50">
                      <XCircle className="w-3 h-3" />
                    </div>
                    <span className="truncate flex-1 text-red-600 dark:text-red-400" title={rawError}>
                      {`${resultData?.type || 'Task'}: ${friendlyError || 'failed'}`}
                    </span>
                  </motion.div>
                )
              }

              // Task completed without URL
              if (isTaskCompleted) {
                return (
                  <motion.div
                    key={partIdx}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
                  >
                    <div className="w-5 h-5 rounded-lg flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/50">
                      <CheckCircle className="w-3 h-3" />
                    </div>
                    <span className="truncate flex-1 text-emerald-600 dark:text-emerald-400">
                      {`${resultData?.type || 'Task'}: completed`}
                    </span>
                  </motion.div>
                )
              }

              // Default tool chip — v0-style with slide-in
              return (
                <motion.div
                  key={partIdx}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: isRunning ? 1 : 0.75, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-xl text-[12px] border transition-all',
                    isRunning ? 'border-forge-border animate-shimmer'
                      : hasError ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20'
                      : 'border-forge-border bg-forge-surface/30',
                  )}
                >
                  <div className={cn('w-5 h-5 rounded-lg flex items-center justify-center shrink-0', colorClasses[info.color] || colorClasses.gray)}>
                    {isRunning ? <Loader2 className="w-3 h-3 animate-spin" />
                      : hasError ? <XCircle className="w-3 h-3 text-red-600 dark:text-red-400" />
                      : <info.Icon className="w-3 h-3" />}
                  </div>
                  <span className={cn('truncate flex-1', hasError ? 'text-red-600 dark:text-red-400' : 'text-forge-text-dim')}>
                    {summary}
                  </span>
                  {!isRunning && !hasError && <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0 opacity-60" />}
                </motion.div>
              )
            }

            return null
          })
        })()}
          {/* Regenerate button — appears on hover */}
          {!isLoading && (
            <button
              onClick={() => onRegenerate(message.id)}
              className="flex items-center gap-1 mt-0.5 px-2 py-1 text-[11px] text-forge-text-dim hover:text-forge-accent opacity-0 group-hover/assistant:opacity-100 transition-all rounded-lg hover:bg-forge-surface"
              title="Regenerate response"
            >
              <RefreshCw className="w-3 h-3" />
              Regenerate
            </button>
          )}
        </div>
      ) : (
        /* Fallback for messages without parts (e.g. loaded from DB) */
        <div className="space-y-2 group/assistant">
          {textContent && (
            <div className="relative group">
              <div
                className={cn(
                  'text-[13.5px] leading-[1.7] text-forge-text [&_pre]:my-3 [&_code]:text-[12.5px]',
                  showStreamingCursor && 'streaming-cursor'
                )}
                dangerouslySetInnerHTML={{ __html: cachedRenderMarkdown(textContent) }}
              />
              <button
                onClick={() => onCopy(message.id, textContent)}
                className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 sm:transition-opacity p-1.5 rounded-lg hover:bg-forge-surface"
                aria-label="Copy message"
                title="Copy"
              >
                {copiedId === message.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-forge-text-dim" />}
              </button>
            </div>
          )}
          {!isLoading && (
            <button
              onClick={() => onRegenerate(message.id)}
              className="flex items-center gap-1 mt-0.5 px-2 py-1 text-[11px] text-forge-text-dim hover:text-forge-accent opacity-0 group-hover/assistant:opacity-100 transition-all rounded-lg hover:bg-forge-surface"
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
  if (prev.message.id !== next.message.id) return false
  if (prev.message.content !== next.message.content) return false
  const pp = prev.message.parts
  const np = next.message.parts
  if ((pp?.length || 0) !== (np?.length || 0)) return false
  if (pp && np) {
    for (let i = 0; i < pp.length; i++) {
      if (pp[i]?.toolInvocation?.state !== np[i]?.toolInvocation?.state) return false
      if (pp[i]?.text !== np[i]?.text) return false
    }
  }
  const prevCopied = prev.copiedId !== null && prev.copiedId.startsWith(prev.message.id)
  const nextCopied = next.copiedId !== null && next.copiedId.startsWith(next.message.id)
  if (prevCopied !== nextCopied) return false
  if (prevCopied && prev.copiedId !== next.copiedId) return false
  if (prev.isEditing !== next.isEditing) return false
  if (prev.isEditing && prev.editingContent !== next.editingContent) return false
  if (prev.isLoading !== next.isLoading) return false
  if (prev.isLast !== next.isLast) return false
  if (prev.envVars !== next.envVars) return false
  return true
})

// ═══════════════════════════════════════════════════════════════════
// Chat Panel — v0-style layout
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

  const [input, setInput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [clearConfirm, setClearConfirm] = useState(false)
  const clearConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const processedInvs = useRef(new Set<string>())
  const historyLoadingRef = useRef(false)
  const localFiles = useRef<Record<string, string>>({})
  const isNearBottomRef = useRef(true)

  useEffect(() => {
    localFiles.current = { ...files }
  }, [files])

  // Clear markdown render cache when switching projects to avoid stale rendered content
  useEffect(() => {
    _mdCache.clear()
  }, [projectId])

  // Smart scroll: only auto-scroll when user is near the bottom
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

  // Auto-scroll only when user is near the bottom (prevents hijacking scroll position when reading history)
  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
    }
  }, [messages, isLoading])

  // Load chat history on mount
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

  // Live file extraction
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

        // Handle capture_preview — trigger screenshot of preview iframe
        if (inv.toolName === 'capture_preview' && inv.state === 'result') {
          const captureKey = `capture:${msg.id}:${i}`
          if (!processedInvs.current.has(captureKey)) {
            processedInvs.current.add(captureKey)
            try {
              const iframe = document.getElementById('forge-preview-iframe') as HTMLIFrameElement | null
              if (iframe?.contentDocument?.body) {
                // Capture the iframe's inner HTML as a text summary for AI review
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
  }, [messages, onBulkFileUpdate, onFileDelete])

  // useChat handles optimistic rendering — user message appears immediately in messages array
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

  const handleEnvVarsSave = useCallback((vars: Record<string, string>) => {
    setEnvVars(prev => ({ ...prev, ...vars }))
    const envContent = Object.entries(vars)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
    onFileChange('.env.local', envContent + '\n')
  }, [onFileChange])

  const handleCancelTask = useCallback(async (taskId: string) => {
    try {
      // PATCH endpoint exists at app/api/tasks/[id]/route.ts — sets status to 'cancelled'
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
    } catch {
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
    const msgIndex = messages.findIndex(m => m.id === editingMessageId)
    if (msgIndex === -1) return
    const newMessages = messages.slice(0, msgIndex)
    setMessages(newMessages)
    processedInvs.current.clear()
    setEditingMessageId(null)
    queueMicrotask(() => append({ role: 'user', content: editingContent.trim() }))
  }

  const handleRegenerate = (messageId: string) => {
    const msgIndex = messages.findIndex(m => m.id === messageId)
    if (msgIndex <= 0) return
    const userMsg = messages[msgIndex - 1]
    if (userMsg.role !== 'user') return
    const newMessages = messages.slice(0, msgIndex)
    setMessages(newMessages)
    processedInvs.current.clear()
    queueMicrotask(() => append({ role: 'user', content: typeof userMsg.content === 'string' ? userMsg.content : '' }))
  }

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

  // Elapsed time tracking
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

  const errorMessage = error
    ? error.message?.includes('429') ? 'Rate limited. Please wait a moment and retry.'
    : error.message?.includes('401') ? 'Session expired. Please sign in again.'
    : error.message?.includes('fetch') || error.message?.includes('network')
      ? 'Connection lost. Check your internet and retry.'
    : error.message || 'Something went wrong. Please try again.'
    : null

  return (
    <ErrorBoundary>
    <div className="h-full flex flex-col bg-forge-bg">
      {/* Messages area — no header, clean like v0 */}
      <div className="flex-1 overflow-y-auto" onScroll={handleScroll} role="log" aria-live="polite" aria-label="Chat messages">
        {loadingHistory ? (
          <div className="px-4 py-6 space-y-4 animate-fade-in">
            {[1, 2, 3].map(i => (
              <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'rounded-2xl p-3.5 space-y-2',
                  i % 2 === 0 ? 'bg-forge-surface w-2/3' : 'bg-forge-surface w-3/4',
                )}>
                  <div className="h-3 rounded animate-skeleton w-full" />
                  <div className="h-3 rounded animate-skeleton w-4/5" />
                  {i % 2 !== 0 && <div className="h-3 rounded animate-skeleton w-3/5" />}
                </div>
              </div>
            ))}
          </div>
        ) : isEmpty ? (
          /* v0-style empty state */
          <div className="flex flex-col items-center justify-center h-full px-6">
            <div className="w-12 h-12 rounded-2xl bg-forge-surface border border-forge-border flex items-center justify-center mb-5">
              <Sparkles className="w-6 h-6 text-forge-text-dim" />
            </div>
            <h2 className="text-xl font-semibold text-forge-text mb-1.5 text-balance text-center">What shall we build?</h2>
            <p className="text-[13px] text-forge-text-dim text-center mb-8">Describe your idea and Forge will build it</p>
            <div className="grid grid-cols-2 gap-2.5 w-full max-w-sm">
              {QUICK_ACTIONS.map(action => (
                <motion.button
                  key={action.label}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleSend(action.query)}
                  className="flex flex-col items-center gap-2 p-4 text-center text-[12.5px] rounded-xl border border-forge-border bg-forge-bg hover:border-forge-text-dim/30 hover:bg-forge-surface/50 transition-all group"
                >
                  <div className="w-9 h-9 rounded-xl bg-forge-surface border border-forge-border flex items-center justify-center group-hover:border-forge-text-dim/30 transition-colors">
                    <action.icon className="w-4 h-4 text-forge-text-dim group-hover:text-forge-text transition-colors" />
                  </div>
                  <span className="text-forge-text-dim group-hover:text-forge-text font-medium transition-colors">{action.label}</span>
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-4 py-4 space-y-4">
            {messages.map((message, idx) => (
              <MessageItem
                key={message.id}
                message={message}
                copiedId={copiedId}
                isEditing={editingMessageId === message.id}
                editingContent={editingContent}
                isLoading={isLoading}
                isLast={idx === messages.length - 1}
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

            {/* Streaming indicator — subtle like v0 */}
            {isLoading && (
              <div className="flex items-center gap-2.5 text-[12px] py-2 px-1 animate-fade-in">
                <Loader2 className="w-3.5 h-3.5 text-forge-text-dim animate-spin" />
                <span className="text-forge-text-dim">
                  {stepCount > 0 ? `Step ${stepCount}` : 'Thinking'}
                  {elapsed > 0 && ` · ${formatElapsed(elapsed)}`}
                </span>
              </div>
            )}

            {/* Error banner */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2.5 text-[12.5px] bg-red-50/80 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3"
              >
                <div className="w-6 h-6 rounded-lg bg-red-100 dark:bg-red-900/50 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-red-700 dark:text-red-400 mb-0.5">Something went wrong</p>
                  <p className="text-red-500 dark:text-red-400/80 leading-relaxed">{errorMessage}</p>
                </div>
                <button
                  onClick={() => reload()}
                  className="shrink-0 px-3 py-1.5 bg-red-100 dark:bg-red-900/50 hover:bg-red-200 dark:hover:bg-red-800/60 text-red-700 dark:text-red-400 rounded-lg text-[11px] font-medium transition-colors"
                >
                  Retry
                </button>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area — v0-style pill with model picker and controls */}
      <div className="border-t border-forge-border p-3 shrink-0 safe-bottom">
        <div className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => {
              setInput(e.target.value)
              const textarea = e.target
              requestAnimationFrame(() => {
                textarea.style.height = 'auto'
                textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
              })
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
            }}
            placeholder={isEmpty ? 'Describe what you want to build...' : 'Ask for changes, new features, fixes...'}
            rows={1}
            className="w-full bg-forge-surface border border-forge-border rounded-2xl pl-4 pr-12 py-3 text-[13.5px] text-forge-text placeholder:text-forge-text-dim/40 outline-none focus:border-forge-accent/40 focus:ring-2 focus:ring-forge-accent/10 resize-none transition-all"
          />
          <div className="absolute right-2 bottom-1.5">
            {isLoading ? (
              <button onClick={stop} className="p-2 rounded-xl bg-red-100 dark:bg-red-900/40 text-forge-danger hover:bg-red-200 dark:hover:bg-red-800/60 transition-colors" title="Stop generating (Esc)">
                <StopCircle className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => handleSend()}
                disabled={!input.trim()}
                className="p-2 rounded-xl bg-forge-text text-forge-bg hover:opacity-90 disabled:opacity-15 disabled:cursor-not-allowed transition-all"
                title="Send message"
              >
                <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
        {/* Footer: model picker + hints + clear + tokens */}
        <div className="flex items-center justify-between mt-2 px-1">
          <div className="flex items-center gap-2">
            {/* Model picker chip */}
            <div className="relative">
              <button
                onClick={() => setShowModelPicker(prev => !prev)}
                className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-forge-text-dim hover:text-forge-text bg-forge-surface border border-forge-border rounded-lg hover:border-forge-text-dim/30 transition-all"
              >
                {MODEL_OPTIONS.find(m => m.id === selectedModel)?.label || 'Sonnet 4'}
                <ChevronDown className="w-2.5 h-2.5" />
              </button>
              {showModelPicker && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowModelPicker(false)} />
                  <div className="absolute left-0 bottom-full mb-1 z-50 w-44 bg-forge-bg border border-forge-border rounded-xl shadow-lg overflow-hidden animate-slide-down">
                    {MODEL_OPTIONS.map(model => (
                      <button
                        key={model.id}
                        onClick={() => { setSelectedModel(model.id); setShowModelPicker(false) }}
                        className={cn(
                          'flex items-center justify-between w-full px-3 py-2 text-[12px] hover:bg-forge-surface transition-colors',
                          selectedModel === model.id && 'bg-forge-surface text-forge-text font-medium',
                        )}
                      >
                        <span>{model.label}</span>
                        <span className="text-[10px] text-forge-text-dim">{model.description}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <span className="text-[10px] text-forge-text-dim/40 hidden sm:inline">
              Enter to send{isLoading ? ' · Esc to stop' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {autoRoutedModel && (
              <span className="text-[10px] text-forge-text-dim/50 flex items-center gap-0.5" title={autoRoutedModel.reason}>
                <Sparkles className="w-2.5 h-2.5" />
                {autoRoutedModel.model.includes('haiku') ? 'Haiku' : autoRoutedModel.model.includes('opus') ? 'Opus' : 'Sonnet'}
              </span>
            )}
            {(realTokens || estimatedTokens) > 0 && (
              <span className="text-[10px] text-forge-text-dim/40" title={realTokens ? 'Actual API token usage' : 'Estimated token usage'}>
                {realTokens ? '' : '~'}{(realTokens || estimatedTokens) > 1000 ? `${((realTokens || estimatedTokens) / 1000).toFixed(1)}k` : (realTokens || estimatedTokens)} tokens
              </span>
            )}
            {isLoading && elapsed > 0 && (
              <span className="text-[10px] text-forge-text-dim/40 flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5" />
                {formatElapsed(elapsed)}
              </span>
            )}
            {messages.length > 0 && (
              <button
                onClick={() => {
                  if (clearConfirm) {
                    setMessages([]); processedInvs.current.clear(); setClearConfirm(false)
                    if (clearConfirmTimer.current) clearTimeout(clearConfirmTimer.current)
                  } else {
                    setClearConfirm(true)
                    clearConfirmTimer.current = setTimeout(() => setClearConfirm(false), 3000)
                  }
                }}
                onMouseLeave={() => { if (clearConfirm) { setClearConfirm(false); if (clearConfirmTimer.current) clearTimeout(clearConfirmTimer.current) } }}
                className={`p-1 transition-colors rounded text-[10px] flex items-center gap-0.5 ${clearConfirm ? 'text-forge-danger' : 'text-forge-text-dim/40 hover:text-forge-danger'}`}
                title={clearConfirm ? 'Click again to confirm' : 'Clear chat'}
                aria-label={clearConfirm ? 'Confirm clear chat' : 'Clear chat'}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {clearConfirm && <span>Clear?</span>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
    </ErrorBoundary>
  )
}
