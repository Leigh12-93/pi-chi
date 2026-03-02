'use client'

import { useState } from 'react'
import { CheckCircle, ChevronDown, Terminal, Loader2, Search, Pencil, GitBranch, Database } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { TOOL_LABELS, colorClasses } from '@/lib/chat/constants'
import { getToolSummary, type ToolInvocation } from '@/lib/chat/tool-utils'

export const SPECIAL_TOOLS = new Set([
  'think', 'suggest_improvement', 'request_env_vars',
  'deploy_to_vercel', 'check_task_status',
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
function getGroupMeta(tools: ToolGroupData['tools']): { Icon: typeof Search; label: string; color: string } {
  const counts: Record<string, number> = {}
  for (const t of tools) counts[t.toolName] = (counts[t.toolName] || 0) + 1
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || ''

  if (['read_file', 'list_files', 'get_all_files', 'forge_read_own_source'].includes(dominant))
    return { Icon: Search, label: 'Explore', color: 'blue' }
  if (['search_files', 'grep_files', 'github_search_code', 'search_references', 'get_reference_code'].includes(dominant))
    return { Icon: Search, label: 'Search', color: 'purple' }
  if (['write_file', 'edit_file', 'rename_file', 'delete_file', 'scaffold_component'].includes(dominant))
    return { Icon: Pencil, label: 'Edit', color: 'yellow' }
  if (dominant.startsWith('github_') || dominant.startsWith('forge_'))
    return { Icon: GitBranch, label: 'Git', color: 'green' }
  if (dominant.startsWith('db_'))
    return { Icon: Database, label: 'Database', color: 'green' }
  return { Icon: Terminal, label: 'Actions', color: 'gray' }
}

/** Get filename + truncated path for a tool call */
function getToolFileInfo(t: { toolName: string; args: Record<string, unknown> }): { name: string; path: string } {
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

  // Count file types for the summary
  const fileCount = tools.length
  const summaryText = `${groupMeta.label} \u00B7 ${fileCount} ${fileCount === 1 ? 'File' : 'Files'}`

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="tool-timeline-group"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2.5 w-full py-1 text-[13px] text-forge-text-dim hover:text-forge-text transition-colors group/toolbtn"
      >
        <div className={cn('w-5 h-5 rounded-md flex items-center justify-center shrink-0', colorClasses[groupMeta.color] || colorClasses.gray)}>
          <groupMeta.Icon className="w-3 h-3" />
        </div>
        <span className="flex-1 text-left font-medium">{summaryText}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-forge-text-dim/40 transition-transform duration-200', expanded && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
            className="overflow-hidden"
          >
            <div className="ml-2.5 border-l border-forge-border/40 pl-4 py-1 space-y-0.5">
              {tools.map((t, i) => {
                const fileInfo = getToolFileInfo(t)
                return (
                  <motion.div
                    key={t.partIdx}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.15, delay: i * 0.03 }}
                    className="flex items-baseline gap-1.5 py-0.5 text-[12px] text-forge-text-dim/70"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-forge-border shrink-0 -ml-[21px] relative top-[5px]" />
                    <span className="shrink-0">{fileInfo.name}</span>
                    {fileInfo.path && <span className="tool-timeline-path hidden sm:inline">{fileInfo.path}</span>}
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
