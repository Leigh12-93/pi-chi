'use client'

import { useState } from 'react'
import { CheckCircle, ChevronDown, Terminal, Loader2 } from 'lucide-react'
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

export function CollapsibleToolGroup({ tools }: { tools: ToolGroupData['tools'] }) {
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
        className="flex items-center gap-2 w-full px-3 py-2 text-[12px] text-forge-text-dim hover:bg-forge-surface-hover transition-colors"
      >
        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 animate-check-in" />
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
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="border-t border-forge-border space-y-0.5 p-1.5">
              {tools.map((t, i) => {
                const info = TOOL_LABELS[t.toolName] || { label: t.toolName.replace(/_/g, ' '), Icon: Terminal, color: 'gray' }
                const summary = getToolSummary(t.toolName, t.args, t.result)
                return (
                  <motion.div
                    key={t.partIdx}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15, delay: i * 0.03 }}
                    className="flex items-center gap-2 px-2.5 py-1 rounded-lg text-[11px] hover:bg-forge-surface/80 transition-colors"
                  >
                    <div className={cn('w-4 h-4 rounded flex items-center justify-center shrink-0', colorClasses[info.color] || colorClasses.gray)}>
                      <info.Icon className="w-2.5 h-2.5" />
                    </div>
                    <span className="truncate flex-1 text-forge-text-dim">{summary}</span>
                    <CheckCircle className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
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
