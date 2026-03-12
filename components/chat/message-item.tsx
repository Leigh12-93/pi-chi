'use client'

import { memo } from 'react'
import {
  Loader2, Copy, Check, Pencil,
  Terminal, RefreshCw,
  CheckCircle, XCircle,
  Paperclip, ChevronRight,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { TOOL_LABELS, colorClasses, TOOL_COMPLETE_LABELS } from '@/lib/chat/constants'
import { getFriendlyError, type ToolInvocation } from '@/lib/chat/tool-utils'
import { cachedRenderMarkdown } from '@/lib/chat/markdown'
import { ThinkPanel, type ThinkPanelProps } from './think-panel'
import { EnvVarInputCard } from './env-var-input-card'
import { PlanCard } from './plan-card'
import { AskCard } from './ask-card'
import { CheckpointCard } from './checkpoint-card'
import { AuditFindingsCard } from './audit-findings-card'
import { ServiceConnectCard } from './service-connect-card'
import { CollapsibleToolGroup, groupToolInvocations, type RenderItem } from './tool-group'
import { getInlineSummary } from './tool-result-detail'
import {
  ReasoningBlock, CommandOutputBlock, InlineDiffBlock, CostChip,
  ExpandableToolItem, SuggestionBlock, DeploySuccessCard,
  TaskRunningCard, TaskFailedCard, TaskCompletedCard,
} from './message-blocks'

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
    <div className={cn('message-enter', isUser ? 'flex justify-end' : '')}>
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
            <div className="flex flex-col gap-0.5 opacity-0 group-hover/user:opacity-100 focus-within:opacity-100 transition-all mt-1.5">
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
                      'absolute top-0 right-0 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 sm:transition-all p-1.5 rounded-lg hover:bg-forge-surface active:scale-90',
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
                return <SuggestionBlock key={partIdx} args={(inv.args || {}) as Record<string, string>} />
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
                return <DeploySuccessCard key={partIdx} toolName={inv.toolName} resultData={resultData!} />
              }

              if (inv.toolName === 'check_task_status' && (isRunning || isTaskRunning)) {
                return <TaskRunningCard key={partIdx} resultData={resultData || {}} onCancelTask={onCancelTask} />
              }

              if (isTaskFailed) {
                const rawError = resultData?.error ? String(resultData.error) : ''
                return <TaskFailedCard key={partIdx} resultData={resultData || {}} friendlyError={getFriendlyError(rawError, inv.toolName)} />
              }

              if (isTaskCompleted) {
                return <TaskCompletedCard key={partIdx} resultData={resultData || {}} />
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
                            <span className="text-[10.5px] text-forge-text-dim/35 font-mono shrink-0 hidden sm:inline truncate sm:max-w-[150px] md:max-w-[200px]" title={inlineSummary}>
                              {inlineSummary.length > 40 ? inlineSummary.slice(0, 37) + '...' : inlineSummary}
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
                  'absolute top-0 right-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 sm:transition-all p-1.5 rounded-lg hover:bg-forge-surface active:scale-90',
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
