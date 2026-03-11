'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Brain, Sparkles, Loader2, CheckCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { TOOL_LABELS, colorClasses } from '@/lib/chat/constants'
import { getGroupMeta, getToolFileInfo } from '@/components/chat/tool-group'
import type { TaskItem } from '@/components/chat/task-list-panel'

const THINKING_MESSAGES = [
  'Thinking deeply',
  'Reasoning through the problem',
  'Analyzing your codebase',
  'Considering the best approach',
  'Planning the implementation',
  'Evaluating options',
  'Working through the details',
  'Almost ready',
]

interface ActivityBlockProps {
  recentCompleted: Array<{ toolName: string; args: Record<string, unknown> }>
  activeToolName: string
  activeToolArgs: Record<string, unknown>
  isLoading: boolean
  elapsed: number
  formatElapsed: (s: number) => string
  stepCount: number
  status: string
  tasks: TaskItem[]
  messageCost?: { inputTokens: number; outputTokens: number; cost: number; model: string } | null
}

/**
 * v0-style taskNameActive / taskNameComplete label pairs.
 * Active = present continuous ("Installing..."), Complete = past tense ("Installed").
 * Used for the active step row and the completed group headers respectively.
 */
const TOOL_DISPLAY: Record<string, { active: string; complete: string }> = {
  add_dependency:    { active: 'Installing',    complete: 'Installed' },
  install_package:   { active: 'Installing',    complete: 'Installed' },
  write_file:        { active: 'Writing',       complete: 'Wrote' },
  edit_file:         { active: 'Editing',       complete: 'Edited' },
  read_file:         { active: 'Reading',       complete: 'Read' },
  delete_file:       { active: 'Deleting',      complete: 'Deleted' },
  run_build:         { active: 'Building project',        complete: 'Built project' },
  verify_build:      { active: 'Verifying build',         complete: 'Verified build' },
  run_dev_server:    { active: 'Starting dev server',     complete: 'Started dev server' },
  run_tests:         { active: 'Running tests',           complete: 'Ran tests' },
  check_types:       { active: 'Checking types',          complete: 'Checked types' },
  deploy_to_vercel:  { active: 'Deploying to Vercel',     complete: 'Deployed to Vercel' },
  create_project:    { active: 'Scaffolding project',     complete: 'Scaffolded project' },
  run_command:       { active: 'Running command',         complete: 'Ran command' },
  search_files:      { active: 'Searching files',         complete: 'Searched files' },
  grep_files:        { active: 'Grepping files',          complete: 'Grepped files' },
  list_files:        { active: 'Listing files',           complete: 'Listed files' },
  scaffold_component:{ active: 'Scaffolding component',   complete: 'Scaffolded component' },
  web_search:        { active: 'Searching the web',       complete: 'Searched the web' },
  think:             { active: 'Planning',                complete: 'Planned' },
  save_project:      { active: 'Saving project',          complete: 'Saved project' },
  rename_file:       { active: 'Renaming',                complete: 'Renamed' },
  manage_tasks:      { active: 'Updating tasks',          complete: 'Updated tasks' },
}

/** Past-tense group labels — v0 shows "Explored 3 files" not "Explore 3 files" */
const GROUP_COMPLETE_LABELS: Record<string, string> = {
  Explore: 'Explored',
  Search: 'Searched',
  Edit: 'Edited',
  Actions: 'Ran',
  Git: 'Committed',
  Database: 'Queried',
}

/** Get a smart active-step label based on tool name + args */
function getActiveLabel(toolName: string, args: Record<string, unknown>): string {
  const path = (args.path || args.file || args.filePath || args.file_path || '') as string
  const fileName = path ? path.split('/').pop() || path : ''
  const display = TOOL_DISPLAY[toolName]

  if (display) {
    // For file-centric tools, append the filename
    if (fileName && ['add_dependency', 'install_package', 'write_file', 'edit_file', 'read_file', 'delete_file', 'rename_file'].includes(toolName)) {
      if (toolName === 'add_dependency') {
        return `${display.active} ${(args.name || args.package || '') as string || 'package'}`
      }
      return `${display.active} ${fileName}`
    }
    return display.active
  }

  const info = TOOL_LABELS[toolName]
  return info?.label || toolName.replace(/_/g, ' ')
}

/** Group completed tool calls by category with past-tense labels (Explored, Edited, Searched) */
function groupByCategory(completed: Array<{ toolName: string; args: Record<string, unknown> }>) {
  const groups = new Map<string, { label: string, color: string, files: string[] }>()

  for (const item of completed) {
    const meta = getGroupMeta([{ toolName: item.toolName, args: item.args, result: null, partIdx: 0 }])
    const fileInfo = getToolFileInfo(item)
    const key = meta.label
    const completeLabel = GROUP_COMPLETE_LABELS[meta.label] || meta.label

    if (!groups.has(key)) {
      groups.set(key, { label: completeLabel, color: meta.color, files: [] })
    }
    const group = groups.get(key)!
    const name = fileInfo.name
    if (name && !group.files.includes(name)) {
      group.files.push(name)
    }
  }

  return Array.from(groups.values())
}

export function ActivityBlock({
  recentCompleted,
  activeToolName,
  activeToolArgs,
  isLoading,
  elapsed,
  formatElapsed,
  stepCount,
  status,
  tasks,
  messageCost,
}: ActivityBlockProps) {
  // Rotating thinking messages
  const [messageIdx, setMessageIdx] = useState(0)
  useEffect(() => {
    if (!isLoading) return
    const interval = setInterval(() => {
      setMessageIdx(prev => (prev + 1) % THINKING_MESSAGES.length)
    }, 6000)
    return () => clearInterval(interval)
  }, [isLoading])

  // Capture snapshot when isLoading transitions false
  const wasLoadingRef = useRef(false)
  const [completionSnapshot, setCompletionSnapshot] = useState<{ stepCount: number; elapsed: number } | null>(null)
  const [showCompletion, setShowCompletion] = useState(false)

  useEffect(() => {
    if (wasLoadingRef.current && !isLoading) {
      // Persist completion — stays visible until next loading cycle
      // Capture values at transition moment only
      setCompletionSnapshot({ stepCount, elapsed })
      setShowCompletion(true)
    } else if (!wasLoadingRef.current && isLoading) {
      // New loading cycle started — clear previous completion
      setShowCompletion(false)
      setCompletionSnapshot(null)
    }
    wasLoadingRef.current = isLoading
  }, [isLoading]) // eslint-disable-line react-hooks/exhaustive-deps -- capture snapshot only on loading transition

  // Reset thinking message index when loading starts
  useEffect(() => {
    if (isLoading) setMessageIdx(0)
  }, [isLoading])

  const hasActivity = activeToolName || recentCompleted.length > 0
  const isThinking = isLoading && !hasActivity && status === 'submitted'
  const isWorking = isLoading && hasActivity

  const groupedCompleted = useMemo(() => groupByCategory(recentCompleted), [recentCompleted])

  // ─── State D: Nothing to show ───
  if (!isLoading && !showCompletion) return null

  // ─── State C: Completion line ───
  if (!isLoading && showCompletion && completionSnapshot) {
    const parts: string[] = []
    if (completionSnapshot.elapsed > 0) parts.push(formatElapsed(completionSnapshot.elapsed))
    if (completionSnapshot.stepCount > 0) parts.push(`${completionSnapshot.stepCount} action${completionSnapshot.stepCount !== 1 ? 's' : ''}`)
    if (messageCost) {
      const totalTok = messageCost.inputTokens + messageCost.outputTokens
      parts.push(totalTok > 1000 ? `${(totalTok / 1000).toFixed(1)}k tok` : `${totalTok} tok`)
      parts.push(`$${messageCost.cost < 0.01 ? messageCost.cost.toFixed(4) : messageCost.cost.toFixed(2)}`)
    }

    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center gap-2.5 py-1.5"
      >
        <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40">
          <CheckCircle className="w-3 h-3 animate-check-in" />
        </div>
        <span className="text-[13px] text-forge-text-dim font-medium">
          Worked for {parts.join(' \u00b7 ')}
        </span>
      </motion.div>
    )
  }

  // ─── State A: Thinking (no tools yet) ───
  if (isThinking) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className={cn('rounded-xl border border-forge-border/50 bg-forge-bg/50 overflow-hidden', elapsed >= 10 && 'thinking-glow')}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-3.5 py-2.5">
          <div className="w-5 h-5 rounded-md bg-forge-accent/10 border border-forge-accent/20 flex items-center justify-center shrink-0 icon-glow-pulse">
            <Brain className="w-3 h-3 text-forge-accent thinking-brain" />
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <AnimatePresence mode="wait">
              <motion.span
                key={messageIdx}
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -2 }}
                transition={{ duration: 0.2 }}
                className="text-[13px] text-forge-text font-medium shimmer-text"
              >
                {THINKING_MESSAGES[messageIdx]}
              </motion.span>
            </AnimatePresence>
            <span className="flex items-center gap-0.5">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </span>
          </div>
          <span className="text-[11px] text-forge-text-dim/40 font-mono shrink-0 tabular-nums">
            {formatElapsed(elapsed)}
          </span>
        </div>
      </motion.div>
    )
  }

  // ─── State B: Working (tools running) ───
  if (isWorking) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-xl border border-forge-border/50 bg-forge-bg/50 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-3.5 py-2.5">
          <div className="w-5 h-5 rounded-md bg-forge-accent/10 border border-forge-accent/20 flex items-center justify-center shrink-0">
            <Sparkles className="w-3 h-3 text-forge-accent animate-pulse" />
          </div>
          <span className="text-[13px] text-forge-text font-medium flex-1">Working...</span>
          <span className="text-[11px] text-forge-text-dim/40 font-mono shrink-0 tabular-nums">
            {formatElapsed(elapsed)}
          </span>
        </div>

        {/* Body */}
        <div className="px-3.5 pb-2.5 space-y-1.5">
          {/* Grouped completed steps */}
          {groupedCompleted.map((group, idx) => (
            <div key={`${group.label}-${idx}`} className="space-y-0.5">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500/70 shrink-0" />
                <span className="text-[12.5px] text-forge-text-dim font-medium">{group.label}</span>
                {group.files.length > 0 && (
                  <span className="text-[11px] text-forge-text-dim/40 font-mono shrink-0 ml-auto">
                    {group.files.length} file{group.files.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {group.files.length > 0 && (
                <div className="pl-[22px] text-[11px] font-mono text-forge-text-dim/50 truncate">
                  {group.files.join(' \u00b7 ')}
                </div>
              )}
            </div>
          ))}

          {/* Active step */}
          {activeToolName && (
            <div className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 text-forge-accent animate-spin shrink-0" />
              <span className="text-[12.5px] text-forge-text font-medium shimmer-text truncate">
                {getActiveLabel(activeToolName, activeToolArgs)}
              </span>
            </div>
          )}

        </div>
      </motion.div>
    )
  }

  return null
}
