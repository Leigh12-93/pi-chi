'use client'

import { memo, useState } from 'react'
import {
  Loader2, Copy, Check, Pencil,
  Terminal, Lightbulb, RefreshCw,
  CheckCircle, XCircle, StopCircle, ExternalLink,
  Paperclip, ImageIcon, ChevronRight, Brain,
  Coins, ChevronDown,
} from 'lucide-react'
import { formatTokens, estimateCost } from '@/lib/chat/constants'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { TOOL_LABELS, colorClasses, TOOL_VARIANTS, variantCardClasses, TOOL_COMPLETE_LABELS } from '@/lib/chat/constants'
import { getToolSummary, getFriendlyError, type ToolInvocation } from '@/lib/chat/tool-utils'
import { cachedRenderMarkdown } from '@/lib/chat/markdown'
import { ThinkPanel, type ThinkPanelProps } from './think-panel'
import { EnvVarInputCard } from './env-var-input-card'
import { PlanCard } from './plan-card'
import { AskCard } from './ask-card'
import { CheckpointCard } from './checkpoint-card'
import { AuditFindingsCard } from './audit-findings-card'
import { ServiceConnectCard } from './service-connect-card'
import { CollapsibleToolGroup, groupToolInvocations, type RenderItem } from './tool-group'
import { ToolResultDetail, getInlineSummary } from './tool-result-detail'

/** A single part from the AI SDK message (v4 or v6 format) */
interface MessagePart {
  type: string
  text?: string
  toolName?: string
  state?: string
  input?: Record<string, unknown>
  output?: unknown
  errorText?: string
  toolInvocation?: ToolInvocation
  // File attachment parts
  mediaType?: string
  url?: string
  filename?: string
}

/** Extract a ToolInvocation from a part, handling both v4 and v6 formats */
function extractToolInvocation(part: Record<string, unknown>): ToolInvocation | null {
  // v4 format: part.toolInvocation
  if (part.toolInvocation) return part.toolInvocation as ToolInvocation
  // v6 format: part itself has toolName, state, input, output
  if (part.toolName) {
    const state = part.state as string
    return {
      toolName: part.toolName as string,
      state: state === 'output-available' ? 'result'
        : state === 'input-available' ? 'call'
        : state === 'output-error' ? 'result'
        : state || 'result',
      args: (part.input as Record<string, unknown>) || {},
      result: state === 'output-error'
        ? { error: (part.errorText as string) || 'Tool error' }
        : part.output as Record<string, unknown> | undefined,
    }
  }
  return null
}

/** Collapsible reasoning/thinking block — shows the AI's internal reasoning */
function ReasoningBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const preview = text.slice(0, 120).replace(/\n/g, ' ')
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
        <span className="flex-1 text-left text-forge-text-dim font-medium truncate">
          {expanded ? 'Thinking' : preview}{!expanded && isTruncated ? '...' : ''}
        </span>
        <ChevronRight className={cn('w-3.5 h-3.5 text-forge-text-dim/40 transition-transform duration-200 shrink-0', expanded && 'rotate-90')} />
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
            <div className="ml-2.5 border-l border-forge-border/40 pl-4 py-2">
              <p className="text-[12.5px] text-forge-text-dim/70 leading-relaxed whitespace-pre-wrap">{text}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** Inline terminal-styled command output for run_command, run_build, etc. */
function CommandOutputBlock({ toolName, args, result }: {
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
      <div className="rounded-lg border border-forge-border bg-[#1a1a2e] dark:bg-[#0d0d1a] overflow-hidden text-[12px] font-mono">
        {/* Command header */}
        <div className={cn(
          'flex items-center gap-2 px-3 py-1.5 border-b',
          ok ? 'border-emerald-800/30 bg-emerald-950/20' : 'border-red-800/30 bg-red-950/20'
        )}>
          <Terminal className={cn('w-3 h-3', ok ? 'text-emerald-400' : 'text-red-400')} />
          <span className="text-gray-300 flex-1 truncate">$ {command}</span>
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded',
            ok ? 'text-emerald-400 bg-emerald-900/30' : 'text-red-400 bg-red-900/30'
          )}>
            {ok ? 'exit 0' : `exit ${exitCode}`}
          </span>
        </div>
        {/* Output */}
        {output.trim() && (
          <div className="px-3 py-2">
            <pre className={cn(
              'text-[11.5px] leading-relaxed whitespace-pre-wrap break-all',
              ok ? 'text-gray-300' : 'text-red-300'
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
function InlineDiffBlock({ oldStr, newStr, path }: {
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
        <span className="text-red-400 font-mono">-{oldLines.length}</span>
        <span className="text-emerald-400 font-mono">+{newLines.length}</span>
        <span className="text-forge-text-dim/50 truncate flex-1 text-left">{path}</span>
        <ChevronRight className={cn('w-3 h-3 text-forge-text-dim/30 transition-transform', expanded && 'rotate-90')} />
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
            <div className="rounded-lg border border-forge-border bg-[#1a1a2e] dark:bg-[#0d0d1a] overflow-hidden text-[11px] font-mono mt-1 max-h-[200px] overflow-y-auto">
              {oldLines.map((line, i) => (
                <div key={`old-${i}`} className="px-2 py-0.5 bg-red-950/20 text-red-300/80">
                  <span className="text-red-400/50 inline-block w-4 text-right mr-2 select-none">-</span>
                  {line}
                </div>
              ))}
              {newLines.map((line, i) => (
                <div key={`new-${i}`} className="px-2 py-0.5 bg-emerald-950/20 text-emerald-300/80">
                  <span className="text-emerald-400/50 inline-block w-4 text-right mr-2 select-none">+</span>
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
function CostChip({ inputTokens, outputTokens, cost, model }: {
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
    <div className="flex items-center gap-1.5 text-[10px] text-forge-text-dim/40 mt-1 select-none" title={`${modelLabel}: ${inputTokens.toLocaleString()} input + ${outputTokens.toLocaleString()} output tokens`}>
      <Coins className="w-2.5 h-2.5" />
      <span>{formatTokens(inputTokens)} in</span>
      <span className="text-forge-text-dim/20">·</span>
      <span>{formatTokens(outputTokens)} out</span>
      <span className="text-forge-text-dim/20">·</span>
      <span>~${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(3)}</span>
    </div>
  )
}

/** Message shape expected by this component — uses Record for broad compatibility with UIMessage */
interface ChatMessage {
  id: string
  role: string
  content?: string
  parts?: Array<Record<string, unknown>>
}

/** Get text from message (supports both v4 content and v6 parts) */
function getTextContent(message: ChatMessage): string {
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.parts)) {
    return message.parts.filter((p) => p.type === 'text').map((p) => (p.text as string) || '').join('')
  }
  return ''
}

/** v0-style card wrapper for tool invocations with variant coloring and collapsible detail */
function ExpandableToolItem({ toolName, args, result, canExpand, children }: {
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
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
            className="overflow-hidden"
          >
            <div className="border-t border-forge-border/20 px-3.5 py-2.5">
              <ToolResultDetail toolName={toolName} args={args} result={result || null} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export interface MessageItemProps {
  message: ChatMessage
  copiedId: string | null
  isEditing: boolean
  editingContent: string
  isLoading: boolean
  isLast: boolean
  envVars: Record<string, string>
  messageCost?: { inputTokens: number; outputTokens: number; cost: number; model: string } | null
  onCopy: (id: string, content: string) => void
  onEditMessage: (id: string, content: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onSetEditingContent: (content: string) => void
  onRegenerate: (id: string) => void
  onEnvVarsSave: (vars: Record<string, string>) => void
  onCancelTask: (taskId: string) => void
  onSendMessage?: (text: string) => void
}

export const MessageItem = memo(function MessageItem({
  message, copiedId, isEditing, editingContent, isLoading, isLast, envVars, messageCost,
  onCopy, onEditMessage, onSaveEdit, onCancelEdit, onSetEditingContent, onRegenerate, onEnvVarsSave, onCancelTask,
  onSendMessage,
}: MessageItemProps) {
  const isUser = message.role === 'user'
  const textContent = getTextContent(message)
  const parts = message.parts

  const showStreamingCursor = isLoading && isLast && !isUser

  return (
    <div className={cn('v0-message-in', isUser ? 'flex justify-end' : '')}>
      {isUser ? (
        isEditing ? (
          <div className="max-w-[85%] w-full">
            <textarea
              value={editingContent}
              onChange={e => onSetEditingContent(e.target.value)}
              className="w-full bg-forge-bg border border-forge-border rounded-xl px-3.5 py-2.5 text-[13.5px] text-forge-text outline-none resize-none focus:border-forge-accent/40 focus:shadow-[0_0_0_3px_var(--color-forge-ring)] transition-all"
              rows={3}
              autoFocus
            />
            <div className="flex justify-end gap-1.5 mt-1.5">
              <button onClick={onCancelEdit} className="px-2.5 py-1 text-[11px] text-forge-text-dim hover:text-forge-text rounded-md transition-colors">Cancel</button>
              <button onClick={onSaveEdit} className="px-2.5 py-1 text-[11px] font-medium text-white bg-forge-accent rounded-md hover:bg-forge-accent-hover transition-colors">Resend</button>
            </div>
          </div>
        ) : (
          <div className="group/user flex items-start gap-1.5 max-w-[85%]">
            <div className="flex flex-col gap-0.5 opacity-0 group-hover/user:opacity-100 transition-all mt-1.5">
              <button
                onClick={() => onCopy(message.id, textContent)}
                className={cn(
                  'p-1 rounded-md text-forge-text-dim hover:text-forge-text hover:bg-forge-surface active:scale-90 transition-all',
                  copiedId === message.id && 'scale-110'
                )}
                title="Copy"
              >
                {copiedId === message.id ? <Check className="w-3 h-3 text-emerald-500 transition-colors" /> : <Copy className="w-3 h-3 transition-colors" />}
              </button>
              <button
                onClick={() => onEditMessage(message.id, textContent)}
                className="p-1 rounded-md text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors"
                title="Edit message"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
            <div className="px-4 py-2.5 rounded-xl rounded-br-md bg-forge-surface border border-forge-border text-[13.5px] text-forge-text leading-relaxed transition-colors">
              {textContent}
              {parts?.filter(p => p.type === 'file').map((filePart, fi) => {
                const mType = filePart.mediaType as string | undefined
                const fUrl = filePart.url as string | undefined
                const fName = filePart.filename as string | undefined
                return (
                  <div key={fi} className="mt-1.5">
                    {mType?.startsWith('image/') ? (
                      <img src={fUrl} alt={fName || 'image'} className="max-w-[200px] max-h-[150px] rounded-lg border border-forge-border" />
                    ) : (
                      <div className="inline-flex items-center gap-1 px-2 py-1 bg-forge-bg/50 border border-forge-border rounded-md text-[11px] text-forge-text-dim font-mono">
                        <Paperclip className="w-3 h-3" />
                        {fName || 'Attached file'}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      ) : parts && parts.length > 0 ? (
        <div className="space-y-0.5 group/assistant">
          {(() => {
          // Detect tool parts: both v4 (type==='tool-invocation') and v6 (type starts with 'tool-')
          const isToolPart = (p: Record<string, unknown>) => p.type === 'tool-invocation' || (typeof p.type === 'string' && p.type?.startsWith('tool-') && p.type !== 'text')
          const getToolName = (p: Record<string, unknown>) => (p.toolInvocation as ToolInvocation | undefined)?.toolName || (p.toolName as string) || (typeof p.type === 'string' ? p.type?.replace(/^tool-/, '') : '') || ''

          let lastCheckIdx = -1
          for (let i = parts.length - 1; i >= 0; i--) {
            if (isToolPart(parts[i]) && getToolName(parts[i]) === 'check_task_status') {
              lastCheckIdx = i
              break
            }
          }

          const filteredParts = parts.filter((part, idx) => {
            if (isToolPart(part) && getToolName(part) === 'check_task_status') {
              return idx === lastCheckIdx
            }
            return true
          })

          // Track files completed by write_file/edit_file — used by ThinkPanel for auto-progress
          const completedFiles = new Set<string>()
          for (const part of filteredParts) {
            if (!isToolPart(part)) continue
            const inv = extractToolInvocation(part)
            if (!inv) continue
            const isComplete = inv.state === 'result'
            const hasError = inv.result && typeof inv.result === 'object' && 'error' in inv.result
            if (isComplete && !hasError) {
              const args = inv.args as Record<string, unknown>
              const path = (args.path || args.file || args.filePath) as string | undefined
              if (path && ['write_file', 'edit_file', 'create_project', 'rename_file', 'delete_file', 'scaffold_component'].includes(inv.toolName)) {
                completedFiles.add(path)
              }
              // create_project completes multiple files — mark all scaffold files
              if (inv.toolName === 'create_project' && inv.result && typeof inv.result === 'object') {
                const files = (inv.result as Record<string, unknown>).files
                if (Array.isArray(files)) files.forEach((f: string) => completedFiles.add(f))
              }
            }
          }

          const grouped = groupToolInvocations(filteredParts)

          let lastTextItemIdx = -1
          for (let gi = grouped.length - 1; gi >= 0; gi--) {
            const gItem = grouped[gi]
            if (gItem.type === 'part' && gItem.part.type === 'text') {
              lastTextItemIdx = gi
              break
            }
          }

          return grouped.map((item: RenderItem, itemIdx: number) => {
            if (item.type === 'tool-group') {
              return <CollapsibleToolGroup key={`group-${itemIdx}`} tools={item.tools} />
            }

            const { part, partIdx } = item
            if (part.type === 'text' && part.text) {
              const isLastText = itemIdx === lastTextItemIdx
              const prevItem = itemIdx > 0 ? grouped[itemIdx - 1] : null
              const nextItem = itemIdx < grouped.length - 1 ? grouped[itemIdx + 1] : null
              const isAfterTool = prevItem && (prevItem.type === 'tool-group' || (prevItem.type === 'part' && prevItem.part.type !== 'text'))
              const isBeforeTool = nextItem && (nextItem.type === 'tool-group' || (nextItem.type === 'part' && nextItem.part.type !== 'text'))
              return (
                <div key={partIdx} className={cn('relative group', isAfterTool && 'mt-3', isBeforeTool && 'mb-1.5')}>
                  <div
                    className={cn(
                      'text-[13.5px] leading-[1.7] text-forge-text [&_pre]:my-3 [&_code]:text-[12.5px] selection:bg-forge-accent/20',
                      showStreamingCursor && isLastText && 'streaming-cursor'
                    )}
                    dangerouslySetInnerHTML={{ __html: cachedRenderMarkdown(part.text) }}
                  />
                  <button
                    onClick={() => onCopy(`${message.id}-${partIdx}`, part.text!)}
                    className={cn(
                      'absolute top-0 right-0 opacity-0 group-hover:opacity-100 sm:transition-all p-1.5 rounded-lg hover:bg-forge-surface active:scale-90',
                      copiedId === `${message.id}-${partIdx}` && 'opacity-100 scale-110'
                    )}
                    aria-label="Copy message"
                    title="Copy"
                  >
                    {copiedId === `${message.id}-${partIdx}` ? <Check className="w-3.5 h-3.5 text-emerald-500 transition-colors" /> : <Copy className="w-3.5 h-3.5 text-forge-text-dim transition-colors" />}
                  </button>
                </div>
              )
            }

            // Reasoning/thinking blocks from extended thinking (Opus 4.6)
            if (part.type === 'reasoning' && (part as any).text) {
              return <ReasoningBlock key={partIdx} text={(part as any).text} />
            }

            if (isToolPart(part)) {
              const inv = extractToolInvocation(part)
              if (!inv) return null
              const info = TOOL_LABELS[inv.toolName] || { label: inv.toolName.replace(/_/g, ' '), Icon: Terminal, color: 'gray' }
              const isRunning = inv.state !== 'result'
              const hasError = inv.result && typeof inv.result === 'object' && 'error' in inv.result
              const summary = getToolSummary(inv.toolName, inv.args || {}, inv.result)
              const resultData = (inv.result && typeof inv.result === 'object') ? inv.result as Record<string, unknown> : null

              if (inv.toolName === 'think' && inv.state === 'result') {
                const planFiles = Array.isArray(inv.args?.files) ? inv.args.files as string[] : []
                const thinkResult = inv.result && typeof inv.result === 'object' ? inv.result as Record<string, unknown> : null
                return (
                  <ThinkPanel
                    key={partIdx}
                    plan={String(inv.args?.plan || '')}
                    files={planFiles}
                    completedFiles={completedFiles}
                    isStreaming={isLoading && isLast}
                    architecture={thinkResult?.architecture as ThinkPanelProps['architecture']}
                    warnings={Array.isArray(thinkResult?.warnings) ? thinkResult.warnings as string[] : undefined}
                  />
                )
              }

              if (inv.toolName === 'suggest_improvement' && inv.state === 'result') {
                const sArgs = (inv.args || {}) as Record<string, string>
                const priority = sArgs.priority || 'medium'
                const priorityColor = priority === 'high' ? 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/40' : priority === 'medium' ? 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40' : 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/40'
                return (
                  <motion.div
                    key={partIdx}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl p-3.5 text-[12px]"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40">
                        <Lightbulb className="w-3 h-3" />
                      </div>
                      <span className="font-medium text-amber-700 dark:text-amber-400">Suggestion</span>
                      <span className={cn('px-1.5 py-0.5 rounded-md text-[10px] font-medium uppercase', priorityColor)}>{priority}</span>
                    </div>
                    <p className="text-amber-700 dark:text-amber-300 mb-1">{sArgs.issue || ''}</p>
                    {sArgs.suggestion && (
                      <pre className="text-[11.5px] bg-forge-surface text-forge-text rounded-md p-2.5 mt-1.5 whitespace-pre-wrap font-mono border border-forge-border/30">{sArgs.suggestion}</pre>
                    )}
                    {sArgs.file && (
                      <span className="inline-block mt-1.5 px-1.5 py-0.5 bg-forge-surface text-forge-text-dim rounded-md text-[11px] font-mono border border-forge-border/30">{sArgs.file}</span>
                    )}
                  </motion.div>
                )
              }

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

              // ── Plan card (present_plan gate) ──
              if (inv.toolName === 'present_plan' && inv.state === 'result') {
                const planData = inv.args as Record<string, unknown>
                if (planData?.files || planData?.__plan_gate) {
                  return (
                    <PlanCard
                      key={partIdx}
                      plan={{
                        summary: String(planData.summary || ''),
                        approach: String(planData.approach || ''),
                        files: Array.isArray(planData.files) ? planData.files as any : [],
                        alternatives: Array.isArray(planData.alternatives) ? planData.alternatives as any : undefined,
                        questions: Array.isArray(planData.questions) ? planData.questions as any : undefined,
                        confidence: Number(planData.confidence || 80),
                        uncertainties: Array.isArray(planData.uncertainties) ? planData.uncertainties as string[] : undefined,
                      }}
                      onApprove={(response) => onSendMessage?.(response)}
                      onReject={(reason) => onSendMessage?.(reason)}
                    />
                  )
                }
              }

              // ── Ask card (ask_user gate) ──
              if (inv.toolName === 'ask_user' && inv.state === 'result') {
                const askData = inv.args as Record<string, unknown>
                if (askData?.question || askData?.__ask_gate) {
                  return (
                    <AskCard
                      key={partIdx}
                      question={String(askData.question || '')}
                      context={askData.context ? String(askData.context) : undefined}
                      options={Array.isArray(askData.options) ? askData.options as any : undefined}
                      recommended={askData.recommended ? String(askData.recommended) : undefined}
                      allowFreeText={askData.allowFreeText !== false}
                      onAnswer={(answer) => onSendMessage?.(answer)}
                    />
                  )
                }
              }

              // ── Checkpoint card ──
              if (inv.toolName === 'checkpoint' && inv.state === 'result') {
                const cpData = inv.args as Record<string, unknown>
                return (
                  <CheckpointCard
                    key={partIdx}
                    phase={String(cpData.phase || '')}
                    completed={Array.isArray(cpData.completed) ? cpData.completed as string[] : []}
                    nextPhase={String(cpData.nextPhase || '')}
                    previewReady={Boolean(cpData.previewReady)}
                    question={cpData.question ? String(cpData.question) : undefined}
                    onAnswer={cpData.question ? (answer) => onSendMessage?.(answer) : undefined}
                  />
                )
              }

              // ── Audit findings card (create_audit_plan gate) ──
              if (inv.toolName === 'create_audit_plan' && inv.state === 'result') {
                const auditData = (inv.result && typeof inv.result === 'object' ? inv.result : inv.args) as Record<string, unknown>
                if (auditData?.__audit_gate || auditData?.findings) {
                  return (
                    <AuditFindingsCard
                      key={partIdx}
                      findings={{
                        summary: String(auditData.summary || ''),
                        overallHealth: (auditData.overallHealth as any) || 'minor_issues',
                        findings: Array.isArray(auditData.findings) ? auditData.findings as any : [],
                        stats: (auditData.stats as any) || { totalFiles: 0, filesScanned: 0, criticalCount: 0, warningCount: 0, infoCount: 0 },
                      }}
                      onFixSelected={(ids) => {
                        onSendMessage?.(`[AUDIT FIX REQUEST] Fix these findings: ${ids.join(', ')}. Design the architecture like a human senior engineer would — read every affected file, understand the full dependency chain, draft a complete plan with task list. Do NOT make any changes until I approve the plan.`)
                      }}
                      onDismiss={() => {
                        onSendMessage?.('[AUDIT DISMISSED] No fixes needed.')
                      }}
                    />
                  )
                }
              }

              // ── Service connect card (connect_service gate) ──
              if (inv.toolName === 'connect_service' && inv.state === 'result') {
                const connectData = (inv.result && typeof inv.result === 'object' ? inv.result : inv.args) as Record<string, unknown>
                if (connectData?.__connect_gate || connectData?.service) {
                  return (
                    <ServiceConnectCard
                      key={partIdx}
                      service={String(connectData.service || '')}
                      message={connectData.message ? String(connectData.message) : undefined}
                      fields={Array.isArray(connectData.fields) ? connectData.fields as any : undefined}
                      onSendMessage={onSendMessage}
                    />
                  )
                }
              }

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
                    className="border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl p-3.5 text-[12px] animate-success-glow"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40">
                        <CheckCircle className="w-3 h-3" />
                      </div>
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">
                        {inv.toolName === 'deploy_to_vercel' ? 'Deployed successfully' : `${String(resultData?.type || 'Task')} completed`}
                      </span>
                    </div>
                    <a
                      href={deployUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[11.5px] text-forge-accent hover:underline font-mono break-all"
                    >
                      {deployUrl}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </motion.div>
                )
              }

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
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 animate-shimmer"
                  >
                    <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 icon-glow-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" />
                    </div>
                    <span className="truncate flex-1 text-blue-600 dark:text-blue-400 shimmer-text-blue">
                      {taskProgress || `${resultData?.type || 'Task'}: in progress...`}
                      {taskElapsed > 0 && ` \u00B7 ${taskElapsed}s`}
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

              if (isTaskFailed) {
                const rawError = resultData?.error ? String(resultData.error) : ''
                const friendlyError = getFriendlyError(rawError, inv.toolName)
                return (
                  <motion.div
                    key={partIdx}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20"
                  >
                    <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40">
                      <XCircle className="w-3 h-3" />
                    </div>
                    <span className="truncate flex-1 text-red-600 dark:text-red-400" title={rawError}>
                      {`${resultData?.type || 'Task'}: ${friendlyError || 'failed'}`}
                    </span>
                  </motion.div>
                )
              }

              if (isTaskCompleted) {
                return (
                  <motion.div
                    key={partIdx}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
                  >
                    <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40">
                      <CheckCircle className="w-3 h-3" />
                    </div>
                    <span className="truncate flex-1 text-emerald-600 dark:text-emerald-400">
                      {`${resultData?.type || 'Task'}: completed`}
                    </span>
                  </motion.div>
                )
              }

              // Command output inline rendering for terminal tools
              const terminalTools = ['run_command', 'run_build', 'run_tests', 'check_types', 'verify_build']
              if (terminalTools.includes(inv.toolName) && !isRunning && resultData && !hasError) {
                const hasOutput = resultData.stdout || resultData.stderr || resultData.output
                if (hasOutput) {
                  return (
                    <CommandOutputBlock
                      key={partIdx}
                      toolName={inv.toolName}
                      args={inv.args || {}}
                      result={resultData}
                    />
                  )
                }
              }

              // Inline diff for edit_file
              if (inv.toolName === 'edit_file' && !isRunning && !hasError) {
                const editArgs = (inv.args || {}) as Record<string, string>
                if (editArgs.old_string && editArgs.new_string && editArgs.path) {
                  return (
                    <InlineDiffBlock
                      key={partIdx}
                      oldStr={editArgs.old_string}
                      newStr={editArgs.new_string}
                      path={editArgs.path}
                    />
                  )
                }
              }

              const rawError = hasError && typeof (inv.result as Record<string, unknown>)?.error === 'string'
                ? (inv.result as Record<string, unknown>).error as string : ''
              const friendlyErr = rawError ? getFriendlyError(rawError, inv.toolName) : ''

              // v0-style timeline item — expandable with detail dropdown
              const args = (inv.args || {}) as Record<string, string>
              const filePath = args.path || args.file || args.filePath || args.file_path || ''
              const fileName = filePath ? filePath.split('/').pop() : ''
              const parentPath = filePath && fileName
                ? filePath.slice(0, filePath.length - fileName.length).replace(/\/$/, '')
                : ''
              const displayPath = parentPath.length > 30
                ? '...' + parentPath.slice(parentPath.length - 27)
                : parentPath

              // Inline result summary badge (e.g., "45 lines", "3 matches")
              const inlineSummary = !isRunning && !hasError
                ? getInlineSummary(inv.toolName, inv.args || {}, inv.result as Record<string, unknown> | null)
                : null

              // Completed tools are expandable
              const canExpand = !isRunning && inv.state === 'result'

              // Past-tense label for completed tools (v0-style)
              const completeLabel = !isRunning && !hasError
                ? TOOL_COMPLETE_LABELS[inv.toolName] || info.label
                : info.label

              return (
                <ExpandableToolItem
                  key={partIdx}
                  toolName={inv.toolName}
                  args={inv.args || {}}
                  result={inv.result as Record<string, unknown> | undefined}
                  canExpand={canExpand}
                >
                  <div className="flex items-center gap-2.5 relative">
                    {/* Icon node */}
                    <div className={cn(
                      'w-5 h-5 rounded-md flex items-center justify-center shrink-0 z-[1]',
                      isRunning ? 'bg-forge-accent/10 border border-forge-accent/30 icon-glow-pulse'
                        : hasError ? 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800'
                        : colorClasses[info.color] || colorClasses.gray
                    )}>
                      {isRunning ? <Loader2 className="w-3 h-3 text-forge-accent animate-spin" />
                        : hasError ? <XCircle className="w-3 h-3 text-red-500" />
                        : <info.Icon className="w-3 h-3" />}
                    </div>

                    {/* Label + path + summary */}
                    <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
                      {hasError ? (
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] text-red-600 dark:text-red-400 font-medium truncate">{info.label} failed</span>
                          <span className="text-[11.5px] text-red-500/70 dark:text-red-400/50 truncate" title={rawError}>{friendlyErr}</span>
                        </div>
                      ) : (
                        <>
                          <span className={cn(
                            'text-[12px] shrink-0',
                            isRunning ? 'text-forge-text/70 font-medium shimmer-text' : 'text-forge-text-dim/70'
                          )}>
                            {isRunning ? info.label : completeLabel}
                          </span>
                          {fileName && (
                            <span className="flex items-baseline gap-1.5 min-w-0 truncate">
                              <span className={cn(
                                'font-mono text-[11.5px] shrink-0',
                                isRunning ? 'text-forge-accent/80 shimmer-text-subtle' : 'text-forge-text-dim/50'
                              )}>
                                {fileName}
                              </span>
                              {displayPath && (
                                <span className={cn('tool-timeline-path hidden sm:inline', isRunning && 'shimmer-text-subtle')}>{displayPath}</span>
                              )}
                            </span>
                          )}
                          {inlineSummary && (
                            <span className="text-[10.5px] text-forge-text-dim/35 font-mono shrink-0 hidden sm:inline">
                              {inlineSummary}
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {/* Status indicators */}
                    {isRunning ? (
                      <span className="text-[11px] text-forge-text-dim/30 font-mono shrink-0 tabular-nums">
                        ...
                      </span>
                    ) : hasError ? null : (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <CheckCircle className="w-3 h-3 text-emerald-500/50" />
                        {canExpand && (
                          <ChevronRight className="w-3 h-3 text-forge-text-dim/20 transition-transform duration-200 expand-chevron" />
                        )}
                      </div>
                    )}
                  </div>
                </ExpandableToolItem>
              )
            }

            return null
          })
        })()}
          {/* Cost chip for parts-based messages */}
          {!isLoading && messageCost && (
            <CostChip
              inputTokens={messageCost.inputTokens}
              outputTokens={messageCost.outputTokens}
              cost={messageCost.cost}
              model={messageCost.model}
            />
          )}
          {!isLoading && (
            <motion.button
              onClick={() => onRegenerate(message.id)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-1 mt-0.5 px-2 py-1 text-[11px] text-forge-text-dim hover:text-forge-accent opacity-40 group-hover/assistant:opacity-100 transition-all rounded-lg hover:bg-forge-surface"
              title="Regenerate response"
            >
              <RefreshCw className="w-3 h-3" />
              Regenerate
            </motion.button>
          )}
        </div>
      ) : (
        <div className="space-y-2 group/assistant">
          {textContent && (
            <div className="relative group">
              <div
                className={cn(
                  'text-[13.5px] leading-[1.7] text-forge-text [&_pre]:my-3 [&_code]:text-[12.5px] selection:bg-forge-accent/20',
                  showStreamingCursor && 'streaming-cursor'
                )}
                dangerouslySetInnerHTML={{ __html: cachedRenderMarkdown(textContent) }}
              />
              <button
                onClick={() => onCopy(message.id, textContent)}
                className={cn(
                  'absolute top-0 right-0 opacity-0 group-hover:opacity-100 sm:transition-all p-1.5 rounded-lg hover:bg-forge-surface active:scale-90',
                  copiedId === message.id && 'opacity-100 scale-110'
                )}
                aria-label="Copy message"
                title="Copy"
              >
                {copiedId === message.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-forge-text-dim" />}
              </button>
            </div>
          )}
          {/* Cost chip for legacy messages */}
          {!isLoading && messageCost && (
            <CostChip
              inputTokens={messageCost.inputTokens}
              outputTokens={messageCost.outputTokens}
              cost={messageCost.cost}
              model={messageCost.model}
            />
          )}
          {!isLoading && (
            <motion.button
              onClick={() => onRegenerate(message.id)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-1 mt-0.5 px-2 py-1 text-[11px] text-forge-text-dim hover:text-forge-accent opacity-40 group-hover/assistant:opacity-100 transition-all rounded-lg hover:bg-forge-surface"
              title="Regenerate response"
            >
              <RefreshCw className="w-3 h-3" />
              Regenerate
            </motion.button>
          )}
        </div>
      )}
    </div>
  )
}, (prev, next) => {
  if (prev.message.id !== next.message.id) return false
  if (getTextContent(prev.message) !== getTextContent(next.message)) return false
  const pp = prev.message.parts
  const np = next.message.parts
  if ((pp?.length || 0) !== (np?.length || 0)) return false
  if (pp && np) {
    for (let i = 0; i < pp.length; i++) {
      // v6: compare state directly on part or via toolInvocation
      const pPart = pp[i] as Record<string, unknown> | undefined
      const nPart = np[i] as Record<string, unknown> | undefined
      const pState = (pPart?.state as string) || (pPart?.toolInvocation as ToolInvocation | undefined)?.state
      const nState = (nPart?.state as string) || (nPart?.toolInvocation as ToolInvocation | undefined)?.state
      if (pState !== nState) return false
      if ((pPart?.text as string) !== (nPart?.text as string)) return false
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
  if (prev.messageCost?.cost !== next.messageCost?.cost) return false
  return true
})
