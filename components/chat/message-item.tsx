'use client'

import { memo } from 'react'
import {
  Loader2, Copy, Check, Pencil,
  Terminal, Lightbulb, RefreshCw,
  CheckCircle, XCircle, StopCircle, ExternalLink,
  Paperclip, ImageIcon,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { TOOL_LABELS, colorClasses } from '@/lib/chat/constants'
import { getToolSummary, getFriendlyError, type ToolInvocation } from '@/lib/chat/tool-utils'
import { cachedRenderMarkdown } from '@/lib/chat/markdown'
import { ThinkPanel } from './think-panel'
import { EnvVarInputCard } from './env-var-input-card'
import { CollapsibleToolGroup, groupToolInvocations, type RenderItem } from './tool-group'

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

export interface MessageItemProps {
  message: ChatMessage
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

export const MessageItem = memo(function MessageItem({
  message, copiedId, isEditing, editingContent, isLoading, isLast, envVars,
  onCopy, onEditMessage, onSaveEdit, onCancelEdit, onSetEditingContent, onRegenerate, onEnvVarsSave, onCancelTask,
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
                <div key={partIdx} className={cn('relative group', isAfterTool && 'mt-2.5', isBeforeTool && 'mb-1')}>
                  <div
                    className={cn(
                      'text-[13.5px] leading-[1.7] text-forge-text [&_pre]:my-3 [&_code]:text-[12.5px] selection:bg-forge-accent/20',
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
                return <ThinkPanel key={partIdx} plan={String(inv.args?.plan || '')} files={planFiles} />
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
                    <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40">
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

              const rawError = hasError && typeof (inv.result as Record<string, unknown>)?.error === 'string'
                ? (inv.result as Record<string, unknown>).error as string : ''
              const friendlyErr = rawError ? getFriendlyError(rawError, inv.toolName) : ''

              // v0-style timeline item
              const args = (inv.args || {}) as Record<string, string>
              const filePath = args.path || args.file || args.filePath || args.file_path || ''
              const fileName = filePath ? filePath.split('/').pop() : ''
              // Truncated parent path for context (like v0 shows)
              const parentPath = filePath && fileName
                ? filePath.slice(0, filePath.length - fileName.length).replace(/\/$/, '')
                : ''
              const displayPath = parentPath.length > 30
                ? '...' + parentPath.slice(parentPath.length - 27)
                : parentPath

              return (
                <motion.div
                  key={partIdx}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="tool-timeline-item"
                >
                  <div className="flex items-center gap-2.5 py-1 relative">
                    {/* Icon node */}
                    <div className={cn(
                      'w-5 h-5 rounded-md flex items-center justify-center shrink-0 z-[1]',
                      isRunning ? 'bg-forge-accent/10 border border-forge-accent/30'
                        : hasError ? 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800'
                        : colorClasses[info.color] || colorClasses.gray
                    )}>
                      {isRunning ? <Loader2 className="w-3 h-3 text-forge-accent animate-spin" />
                        : hasError ? <XCircle className="w-3 h-3 text-red-500" />
                        : <info.Icon className="w-3 h-3" />}
                    </div>

                    {/* Label + path */}
                    <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
                      {hasError ? (
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] text-red-600 dark:text-red-400 font-medium truncate">{info.label} failed</span>
                          <span className="text-[11.5px] text-red-500/70 dark:text-red-400/50 truncate" title={rawError}>{friendlyErr}</span>
                        </div>
                      ) : (
                        <>
                          <span className={cn(
                            'text-[13px] shrink-0',
                            isRunning ? 'text-forge-text font-medium' : 'text-forge-text-dim'
                          )}>
                            {info.label}
                          </span>
                          {fileName && (
                            <span className="flex items-baseline gap-1.5 min-w-0 truncate">
                              <span className={cn(
                                'font-mono text-[11.5px] shrink-0',
                                isRunning ? 'text-forge-accent/80' : 'text-forge-text-dim/50'
                              )}>
                                {fileName}
                              </span>
                              {displayPath && (
                                <span className="tool-timeline-path hidden sm:inline">{displayPath}</span>
                              )}
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {/* Running dots */}
                    {isRunning && (
                      <span className="flex items-center gap-0.5 text-[11px] text-forge-accent/60 shrink-0">
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                        <span className="typing-dot" />
                      </span>
                    )}
                  </div>
                </motion.div>
              )
            }

            return null
          })
        })()}
          {!isLoading && (
            <button
              onClick={() => onRegenerate(message.id)}
              className="flex items-center gap-1 mt-0.5 px-2 py-1 text-[11px] text-forge-text-dim hover:text-forge-accent opacity-40 group-hover/assistant:opacity-100 transition-all rounded-lg hover:bg-forge-surface"
              title="Regenerate response"
            >
              <RefreshCw className="w-3 h-3" />
              Regenerate
            </button>
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
              className="flex items-center gap-1 mt-0.5 px-2 py-1 text-[11px] text-forge-text-dim hover:text-forge-accent opacity-40 group-hover/assistant:opacity-100 transition-all rounded-lg hover:bg-forge-surface"
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
  return true
})
