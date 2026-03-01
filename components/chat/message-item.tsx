'use client'

import { memo } from 'react'
import {
  Loader2, Copy, Check, Pencil,
  Terminal, Lightbulb, RefreshCw,
  CheckCircle, XCircle, StopCircle, ExternalLink,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { TOOL_LABELS, colorClasses } from '@/lib/chat/constants'
import { getToolSummary, type ToolInvocation } from '@/lib/chat/tool-utils'
import { cachedRenderMarkdown } from '@/lib/chat/markdown'
import { ThinkPanel } from './think-panel'
import { EnvVarInputCard } from './env-var-input-card'
import { CollapsibleToolGroup, groupToolInvocations } from './tool-group'

export interface MessageItemProps {
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

export const MessageItem = memo(function MessageItem({
  message, copiedId, isEditing, editingContent, isLoading, isLast, envVars,
  onCopy, onEditMessage, onSaveEdit, onCancelEdit, onSetEditingContent, onRegenerate, onEnvVarsSave, onCancelTask,
}: MessageItemProps) {
  const isUser = message.role === 'user'
  const textContent = typeof message.content === 'string' ? message.content : ''
  const parts = (message as any).parts as Array<{ type: string; text?: string; toolInvocation?: ToolInvocation }> | undefined

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
            <div className="px-4 py-2.5 rounded-2xl rounded-br-md bg-forge-surface border border-forge-border text-[13.5px] text-forge-text leading-relaxed shadow-sm transition-shadow hover:shadow-md">
              {textContent}
            </div>
          </div>
        )
      ) : parts && parts.length > 0 ? (
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
                    className="border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl p-3 text-[12px]"
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span className="font-medium text-amber-700 dark:text-amber-400">Suggestion</span>
                      <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-medium uppercase', priorityColor)}>{priority}</span>
                    </div>
                    <p className="text-amber-700 dark:text-amber-300 mb-1">{sArgs.issue || ''}</p>
                    {sArgs.suggestion && (
                      <pre className="text-[11px] bg-forge-surface dark:bg-gray-950 text-forge-text dark:text-gray-200 rounded-lg p-2.5 mt-1.5 whitespace-pre-wrap font-mono">{sArgs.suggestion}</pre>
                    )}
                    {sArgs.file && (
                      <span className="inline-block mt-1.5 px-1.5 py-0.5 bg-forge-surface text-forge-text-dim rounded text-[10px] font-mono">{sArgs.file}</span>
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

              return (
                <motion.div
                  key={partIdx}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: isRunning ? 1 : 0.75, x: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-xl text-[12px] border-l-2 border transition-all',
                    isRunning ? 'border-forge-border border-l-forge-accent animate-gradient-sweep'
                      : hasError ? 'border-red-200 dark:border-red-800 border-l-red-400 bg-red-50/50 dark:bg-red-950/20'
                      : 'border-forge-border border-l-emerald-400 dark:border-l-emerald-500 bg-forge-surface/30 animate-chip-complete',
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
                  {!isRunning && !hasError && <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0 animate-check-in" />}
                </motion.div>
              )
            }

            return null
          })
        })()}
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
