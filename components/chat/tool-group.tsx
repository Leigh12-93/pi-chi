'use client'

import { useState } from 'react'
import { CheckCircle, ChevronDown, ChevronRight, Terminal, Search, Pencil, GitBranch, Database } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { TOOL_LABELS, colorClasses, TOOL_VARIANTS, variantCardClasses, TOOL_COMPLETE_LABELS } from '@/lib/chat/constants'
import { type ToolInvocation } from '@/lib/chat/tool-utils'
import { ToolResultDetail, getInlineSummary } from './tool-result-detail'

export const SPECIAL_TOOLS = new Set([
  'think', 'suggest_improvement', 'request_env_vars',
  'deploy_to_vercel', 'check_task_status', 'connect_service',
])

export interface ToolGroupData {
  type: 'tool-group'
  tools: Array<{ toolName: string; args: Record<string, unknown>; result: unknown; partIdx: number }>
}

export type RenderItem =
  | { type: 'part'; part: { type: string; text?: string; toolInvocation?: ToolInvocation }; partIdx: number }
  | ToolGroupData

/** Extract tool info from a part (supports both v4 and v6 formats) */
function getToolInfo(part: any): { toolName: string; state: string; args: Record<string, unknown>; result: unknown } | null {
  // v4: part.toolInvocation
  if (part.toolInvocation) {
    const inv = part.toolInvocation
    return { toolName: inv.toolName, state: inv.state, args: inv.args || {}, result: inv.result }
  }
  // v6: part.toolName, part.state, part.input, part.output
  if (part.toolName) {
    return {
      toolName: part.toolName,
      state: part.state === 'output-available' ? 'result' : part.state === 'input-available' ? 'call' : (part.state || 'result'),
      args: part.input || {},
      result: part.state === 'output-error' ? { error: part.errorText || 'Tool error' } : part.output,
    }
  }
  return null
}

function isToolPart(part: any): boolean {
  return part.type === 'tool-invocation' || !!(part.toolName) || (part.type?.startsWith('tool-') && part.type !== 'text')
}

export function groupToolInvocations(parts: Array<any>): RenderItem[] {
  const items: RenderItem[] = []
  let currentGroup: ToolGroupData['tools'] = []

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
    const toolInfo = isToolPart(part) ? getToolInfo(part) : null

    const isGroupable = toolInfo
      && toolInfo.state === 'result'
      && !SPECIAL_TOOLS.has(toolInfo.toolName)
      && !(toolInfo.result && typeof toolInfo.result === 'object' && 'error' in (toolInfo.result as object))

    if (isGroupable && toolInfo) {
      currentGroup.push({ toolName: toolInfo.toolName, args: toolInfo.args, result: toolInfo.result, partIdx: i })
    } else {
      flushGroup()
      items.push({ type: 'part', part, partIdx: i })
    }
  }
  flushGroup()

  return items
}

/** Get a v0-style group icon & label based on the dominant tool type */
export function getGroupMeta(tools: ToolGroupData['tools']): { Icon: typeof Search; label: string; color: string } {
  const counts: Record<string, number> = {}
  for (const t of tools) counts[t.toolName] = (counts[t.toolName] || 0) + 1
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || ''

  if (['read_file', 'list_files', 'get_all_files', 'pi_read_own_source'].includes(dominant))
    return { Icon: Search, label: 'Explore', color: 'blue' }
  if (['search_files', 'grep_files', 'github_search_code', 'search_references', 'get_reference_code'].includes(dominant))
    return { Icon: Search, label: 'Search', color: 'purple' }
  if (['write_file', 'edit_file', 'rename_file', 'delete_file', 'scaffold_component'].includes(dominant))
    return { Icon: Pencil, label: 'Edit', color: 'yellow' }
  if (dominant.startsWith('github_') || dominant.startsWith('pi_'))
    return { Icon: GitBranch, label: 'Git', color: 'green' }
  if (dominant.startsWith('db_'))
    return { Icon: Database, label: 'Database', color: 'green' }
  return { Icon: Terminal, label: 'Actions', color: 'gray' }
}

/** Get filename + truncated path for a tool call */
export function getToolFileInfo(t: { toolName: string; args: Record<string, unknown> }): { name: string; path: string } {
  const args = t.args as Record<string, string>
  const filePath = args.path || args.file || args.filePath || args.file_path || args.pattern || ''
  if (filePath) {
    const fileName = filePath.split('/').pop() || filePath
    const parentPath = filePath.slice(0, filePath.length - fileName.length).replace(/\/$/, '')
    const displayPath = parentPath.length > 25 ? '...' + parentPath.slice(parentPath.length - 22) : parentPath
    return { name: fileName, path: displayPath }
  }
  const info = TOOL_LABELS[t.toolName]
  return { name: info?.label || t.toolName.replace(/_/g, ' '), path: '' }
}

export function CollapsibleToolGroup({ tools }: { tools: ToolGroupData['tools'] }) {
  const [expanded, setExpanded] = useState(false)
  const groupMeta = getGroupMeta(tools)

  // Dedupe file names for compact chip display
  const fileChips = (() => {
    const seen = new Map<string, number>()
    for (const t of tools) {
      const fi = getToolFileInfo(t)
      const name = fi.name
      seen.set(name, (seen.get(name) || 0) + 1)
    }
    return Array.from(seen.entries())
  })()

  const fileCount = tools.length

  // Determine dominant variant for the group card
  const dominantTool = (() => {
    const counts: Record<string, number> = {}
    for (const t of tools) counts[t.toolName] = (counts[t.toolName] || 0) + 1
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
  })()
  const variant = TOOL_VARIANTS[dominantTool] || 'default'
  const vc = variantCardClasses[variant]

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn('rounded-xl border overflow-hidden transition-all duration-300', vc.border, vc.bg)}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2.5 w-full px-3.5 py-2 text-[13px] text-pi-text-dim hover:text-pi-text transition-colors group/toolbtn"
      >
        <div className={cn('w-5 h-5 rounded-md flex items-center justify-center shrink-0', colorClasses[groupMeta.color] || colorClasses.gray)}>
          <groupMeta.Icon className="w-3 h-3" />
        </div>
        <span className="flex-1 text-left font-medium text-[12px]">{groupMeta.label}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10.5px] text-pi-text-dim/40 font-mono">{fileCount} file{fileCount !== 1 ? 's' : ''}</span>
          <CheckCircle className="w-3 h-3 text-emerald-500/50" />
          <ChevronDown className={cn('w-3 h-3 text-pi-text-dim/20 transition-transform duration-200', expanded && 'rotate-180')} />
        </div>
      </button>

      {/* Compact file chips row - always visible */}
      {!expanded && fileChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3.5 pb-2">
          {fileChips.map(([name, count]) => (
            <span key={name} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-mono text-pi-text-dim/60 bg-pi-surface/50 border border-pi-border/30">
              <CheckCircle className="w-3 h-3 text-emerald-500/70" />
              {name}
              {count > 1 && <span className="text-pi-text-dim/40">x{count}</span>}
            </span>
          ))}
        </div>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
            className="overflow-hidden"
          >
            <div className="border-t border-pi-border/20 px-3.5 py-2 space-y-0.5">
              {tools.map((t, i) => (
                <GroupedToolDetail key={t.partIdx} tool={t} index={i} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** Individual tool within a group — shows summary badge and is expandable for detail */
function GroupedToolDetail({ tool: t, index: i }: { tool: ToolGroupData['tools'][0]; index: number }) {
  const [detailOpen, setDetailOpen] = useState(false)
  const fileInfo = getToolFileInfo(t)
  const info = TOOL_LABELS[t.toolName] || { label: t.toolName.replace(/_/g, ' '), Icon: Terminal, color: 'gray' }
  const summary = getInlineSummary(t.toolName, t.args, t.result as Record<string, unknown> | null)

  return (
    <motion.div
      key={t.partIdx}
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.15, delay: i * 0.03 }}
    >
      <div
        className="flex items-center gap-1.5 py-0.5 text-[12px] text-pi-text-dim/70 cursor-pointer hover:text-pi-text-dim/90 transition-colors"
        onClick={() => setDetailOpen(!detailOpen)}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setDetailOpen(!detailOpen) }}
      >
        <CheckCircle className="w-3 h-3 text-emerald-500/40 shrink-0" />
        <span className="text-pi-text-dim/50 shrink-0">{TOOL_COMPLETE_LABELS[t.toolName] || info.label}</span>
        <span className="font-mono shrink-0">{fileInfo.name}</span>
        {fileInfo.path && <span className="tool-timeline-path hidden sm:inline">{fileInfo.path}</span>}
        {summary && (
          <span className="text-[10px] text-pi-text-dim/30 font-mono shrink-0 hidden sm:inline">{summary}</span>
        )}
        <ChevronRight className={cn('w-2.5 h-2.5 text-pi-text-dim/20 shrink-0 ml-auto transition-transform duration-150', detailOpen && 'rotate-90')} />
      </div>
      <AnimatePresence>
        {detailOpen && (
          <ToolResultDetail
            toolName={t.toolName}
            args={t.args}
            result={t.result as Record<string, unknown> | null}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
