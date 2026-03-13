'use client'

import { useState } from 'react'
import {
  Brain, Terminal, ChevronRight, ChevronDown,
  Coins, Lightbulb, CheckCircle, XCircle,
  Loader2, StopCircle, ExternalLink,
} from 'lucide-react'
import { formatTokens } from '@/lib/chat/constants'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { TOOL_VARIANTS, variantCardClasses } from '@/lib/chat/constants'
import { ToolResultDetail } from './tool-result-detail'

/** Collapsible reasoning/thinking block — shows the AI's internal reasoning */
export function ReasoningBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const raw = text.slice(0, 140).replace(/\n/g, ' ')
  const preview = raw.length > 120 ? raw.slice(0, 120).replace(/\s+\S*$/, '') : raw
  const isTruncated = text.length > 120

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="tool-timeline-item"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2.5 w-full py-1 text-[13px] hover:opacity-80 transition-opacity"
      >
        <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/40">
          <Brain className="w-3 h-3" />
        </div>
        <span className="flex-1 text-left text-pi-text-dim font-medium truncate">
          {expanded ? 'Thinking' : preview}{!expanded && isTruncated ? '...' : ''}
        </span>
        <ChevronRight className={cn('w-3.5 h-3.5 text-pi-text-dim/40 transition-transform duration-200 shrink-0', expanded && 'rotate-90')} />
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
            <div className="ml-2.5 border-l border-pi-border/40 pl-4 py-2">
              <p className="text-[12.5px] text-pi-text-dim/70 leading-relaxed whitespace-pre-wrap">{text}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** Inline terminal-styled command output for run_command, run_build, etc. */
export function CommandOutputBlock({ toolName, args, result }: {
  toolName: string
  args: Record<string, unknown>
  result: Record<string, unknown>
}) {
  const [expanded, setExpanded] = useState(false)
  const command = String(args.command || args.packages || toolName.replace(/_/g, ' '))
  const stdout = String(result.stdout || result.output || '')
  const stderr = String(result.stderr || '')
  const exitCode = result.exitCode as number | undefined ?? (result.ok ? 0 : 1)
  const ok = exitCode === 0 || result.ok === true
  const output = stderr && !ok ? stderr : stdout || stderr
  const lines = output.split('\n')
  const truncated = lines.length > 10
  const preview = truncated ? lines.slice(0, 10).join('\n') : output

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="tool-timeline-item"
    >
      <div className="rounded-lg border border-pi-border bg-pi-terminal dark:bg-pi-terminal-dark overflow-hidden text-[12px] font-mono">
        {/* Command header */}
        <div className={cn(
          'flex items-center gap-2 px-3 py-1.5 border-b',
          ok ? 'border-pi-diff-added/30 bg-pi-diff-added/10' : 'border-pi-diff-removed/30 bg-pi-diff-removed/10'
        )}>
          <Terminal className={cn('w-3 h-3', ok ? 'text-pi-diff-added' : 'text-pi-diff-removed')} />
          <span className="text-gray-300 dark:text-gray-300 flex-1 truncate">$ {command}</span>
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded',
            ok ? 'text-pi-diff-added bg-pi-diff-added/20' : 'text-pi-diff-removed bg-pi-diff-removed/20'
          )}>
            {ok ? 'exit 0' : `exit ${exitCode}`}
          </span>
        </div>
        {/* Output */}
        {output.trim() && (
          <div className="px-3 py-2">
            <pre className={cn(
              'text-[11.5px] leading-relaxed whitespace-pre-wrap break-all',
              ok ? 'text-gray-300' : 'text-pi-diff-removed/80'
            )}>
              {expanded ? output : preview}
            </pre>
            {truncated && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="mt-1.5 text-[10px] text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-0.5"
              >
                <ChevronDown className={cn('w-3 h-3 transition-transform', expanded && 'rotate-180')} />
                {expanded ? 'Show less' : `Show full output (${lines.length} lines)`}
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}

/** Inline diff display for edit_file operations */
export function InlineDiffBlock({ oldStr, newStr, path }: {
  oldStr: string
  newStr: string
  path: string
}) {
  const [expanded, setExpanded] = useState(false)
  const oldLines = oldStr.split('\n')
  const newLines = newStr.split('\n')

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="tool-timeline-item"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full py-0.5 text-[11px] hover:opacity-80 transition-opacity"
      >
        <span className="text-pi-diff-removed font-mono">-{oldLines.length}</span>
        <span className="text-pi-diff-added font-mono">+{newLines.length}</span>
        <span className="text-pi-text-dim/50 truncate flex-1 text-left">{path}</span>
        <ChevronRight className={cn('w-3 h-3 text-pi-text-dim/30 transition-transform', expanded && 'rotate-90')} />
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
            <div className="rounded-lg border border-pi-border bg-pi-terminal dark:bg-pi-terminal-dark overflow-hidden text-[11px] font-mono mt-1 max-h-[200px] overflow-y-auto">
              {oldLines.map((line, i) => (
                <div key={`old-${i}`} className="px-2 py-0.5 bg-pi-diff-removed/10 text-pi-diff-removed/80">
                  <span className="text-pi-diff-removed/50 inline-block w-4 text-right mr-2 select-none">-</span>
                  {line}
                </div>
              ))}
              {newLines.map((line, i) => (
                <div key={`new-${i}`} className="px-2 py-0.5 bg-pi-diff-added/10 text-pi-diff-added/80">
                  <span className="text-pi-diff-added/50 inline-block w-4 text-right mr-2 select-none">+</span>
                  {line}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** Per-message cost chip */
export function CostChip({ inputTokens, outputTokens, cost, model }: {
  inputTokens: number
  outputTokens: number
  cost: number
  model: string
}) {
  if (inputTokens === 0 && outputTokens === 0) return null
  const modelLabel = model.includes('haiku') ? 'Haiku'
    : model.includes('opus-4-6') ? 'Opus 4.6'
    : model.includes('opus') ? 'Opus'
    : 'Sonnet'
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-pi-text-dim/40 mt-1 select-none cost-chip-enter" title={`${modelLabel}: ${inputTokens.toLocaleString()} input + ${outputTokens.toLocaleString()} output tokens`}>
      <Coins className="w-2.5 h-2.5" />
      <span>{formatTokens(inputTokens)} in</span>
      <span className="text-pi-text-dim/20">&middot;</span>
      <span>{formatTokens(outputTokens)} out</span>
      <span className="text-pi-text-dim/20">&middot;</span>
      <span>~${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(3)}</span>
    </div>
  )
}

/** v0-style card wrapper for tool invocations with variant coloring and collapsible detail */
export function ExpandableToolItem({ toolName, args, result, canExpand, children }: {
  toolName: string
  args: Record<string, unknown>
  result: Record<string, unknown> | undefined
  canExpand: boolean
  children: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const variant = TOOL_VARIANTS[toolName] || 'default'
  const vc = variantCardClasses[variant]

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={cn('rounded-xl border overflow-hidden transition-all duration-300', vc.border, vc.bg)}
    >
      <div
        className={cn('px-3.5 py-2', canExpand && 'cursor-pointer')}
        onClick={canExpand ? () => setExpanded(!expanded) : undefined}
        role={canExpand ? 'button' : undefined}
        tabIndex={canExpand ? 0 : undefined}
        onKeyDown={canExpand ? e => { if (e.key === 'Enter' || e.key === ' ') setExpanded(!expanded) } : undefined}
      >
        {children}
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="overflow-hidden"
          >
            <div className="border-t border-pi-border/20 px-3.5 py-2.5">
              <ToolResultDetail toolName={toolName} args={args} result={result || null} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** Suggestion improvement card */
export function SuggestionBlock({ args }: { args: Record<string, string> }) {
  const priority = args.priority || 'medium'
  const priorityColor = priority === 'high' ? 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/40' : priority === 'medium' ? 'text-pi-warning bg-pi-warning/10' : 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/40'
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="border border-pi-warning/30 bg-pi-warning/5 rounded-xl p-3.5 text-[12px]"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-pi-warning bg-pi-warning/10">
          <Lightbulb className="w-3 h-3" />
        </div>
        <span className="font-medium text-pi-warning">Suggestion</span>
        <span className={cn('px-1.5 py-0.5 rounded-md text-[10px] font-medium uppercase', priorityColor)}>{priority}</span>
      </div>
      <p className="text-pi-warning/80 mb-1">{args.issue || ''}</p>
      {args.suggestion && (
        <pre className="text-[11.5px] bg-pi-surface text-pi-text rounded-md p-2.5 mt-1.5 whitespace-pre-wrap font-mono border border-pi-border/30">{args.suggestion}</pre>
      )}
      {args.file && (
        <span className="inline-block mt-1.5 px-1.5 py-0.5 bg-pi-surface text-pi-text-dim rounded-md text-[11px] font-mono border border-pi-border/30">{args.file}</span>
      )}
    </motion.div>
  )
}

/** Deploy success card */
export function DeploySuccessCard({ toolName, resultData }: {
  toolName: string
  resultData: Record<string, unknown>
}) {
  const deployUrl = resultData.url as string
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="border border-pi-success/30 bg-pi-success/5 rounded-xl p-3.5 text-[12px] animate-success-glow"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-pi-success bg-pi-success/10">
          <CheckCircle className="w-3 h-3" />
        </div>
        <span className="font-medium text-pi-success">
          {toolName === 'deploy_to_vercel' ? 'Deployed successfully' : `${String(resultData.type || 'Task')} completed`}
        </span>
      </div>
      <a
        href={deployUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-[11.5px] text-pi-accent hover:underline font-mono break-all"
      >
        {deployUrl}
        <ExternalLink className="w-3 h-3 shrink-0" />
      </a>
    </motion.div>
  )
}

/** Task running indicator */
export function TaskRunningCard({ resultData, onCancelTask }: {
  resultData: Record<string, unknown>
  onCancelTask: (taskId: string) => void
}) {
  const taskProgress = resultData.progress as string | undefined
  const taskCreatedAt = resultData.created_at ? new Date(resultData.created_at as string).getTime() : 0
  const taskElapsed = taskCreatedAt ? Math.floor((Date.now() - taskCreatedAt) / 1000) : 0
  const runningTaskId = resultData.id as string | undefined
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 animate-shimmer"
    >
      <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 icon-glow-pulse">
        <Loader2 className="w-3 h-3 animate-spin" />
      </div>
      <span className="truncate flex-1 text-blue-600 dark:text-blue-400 shimmer-text-blue">
        {taskProgress || `${resultData.type || 'Task'}: in progress...`}
        {taskElapsed > 0 && ` \u00B7 ${taskElapsed}s`}
      </span>
      {runningTaskId && (
        <button
          onClick={() => onCancelTask(runningTaskId)}
          className="shrink-0 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/50 text-blue-400 hover:text-red-500 transition-colors"
          title="Cancel task"
          aria-label="Cancel task"
        >
          <StopCircle className="w-3.5 h-3.5" />
        </button>
      )}
    </motion.div>
  )
}

/** Task failed card */
export function TaskFailedCard({ resultData, friendlyError }: {
  resultData: Record<string, unknown>
  friendlyError: string
}) {
  const rawError = resultData.error ? String(resultData.error) : ''
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] border border-pi-danger/30 bg-pi-danger/5"
    >
      <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-pi-danger bg-pi-danger/10">
        <XCircle className="w-3 h-3" />
      </div>
      <span className="truncate flex-1 text-pi-danger" title={rawError}>
        {`${resultData.type || 'Task'}: ${friendlyError || 'failed'}`}
      </span>
    </motion.div>
  )
}

/** Task completed card */
export function TaskCompletedCard({ resultData }: { resultData: Record<string, unknown> }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] border border-pi-success/30 bg-pi-success/5"
    >
      <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-pi-success bg-pi-success/10">
        <CheckCircle className="w-3 h-3" />
      </div>
      <span className="truncate flex-1 text-pi-success">
        {`${resultData.type || 'Task'}: completed`}
      </span>
    </motion.div>
  )
}
