'use client'

import { useRef, useEffect } from 'react'
import type { UIMessage } from 'ai'
import { extractFileUpdates, type ToolInvocation } from '@/lib/chat/tool-utils'
import { clearMarkdownCache } from '@/lib/chat/markdown'
import { DESTRUCTIVE_TOOLS, DANGEROUS_COMMAND_PATTERNS } from '@/lib/chat/constants'
import type { PendingChanges } from './use-file-change-tracker'
import type { PendingApprovalInfo } from './use-approval-gate'

/** Message part shape for tool extraction */
interface MessagePart {
  type: string
  text?: string
  toolName?: string
  toolCallId?: string
  state?: string
  input?: unknown
  args?: Record<string, unknown>
  output?: unknown
  result?: unknown
  toolInvocation?: ToolInvocation
}

/** Extended UIMessage with optional legacy toolInvocations */
interface PiUIMessage extends UIMessage {
  toolInvocations?: ToolInvocation[]
}

export interface UseToolProcessorProps {
  messages: UIMessage[]
  files: Record<string, string>
  projectId: string | null
  onBulkFileUpdate: (files: Record<string, string>) => void
  onFileDelete: (path: string) => void
  /** Mutable ref for pending file changes tracking */
  pendingChangesRef: React.RefObject<PendingChanges>
  /** Current pending approval info (to avoid re-showing) */
  pendingApproval: PendingApprovalInfo | null
  /** Set pending approval for destructive tools */
  setPendingApproval: React.Dispatch<React.SetStateAction<PendingApprovalInfo | null>>
  /** Ref of approved invocation keys */
  approvedKeys: React.RefObject<Set<string>>
  /** Ref of denied invocation keys */
  deniedKeys: React.RefObject<Set<string>>
  /** Send a message (for auto-approve plans) */
  sendMessage: (opts: { text: string }) => void
  /** Task management state */
  setTasks: React.Dispatch<React.SetStateAction<Array<{
    id: string; label: string; status: string
    description?: string; blockedBy?: string[]; phase?: string
  }>>>
  latestTasksRef: React.MutableRefObject<Array<{
    id: string; label: string; status: string
    description?: string; blockedBy?: string[]; phase?: string
  }>>
  taskDebounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
}

export interface UseToolProcessorReturn {
  /** Ref to the set of processed invocation keys (exposed for clear on edit/regenerate/clear) */
  processedInvs: React.RefObject<Set<string>>
  /** Ref to live local file state (synchronous reads during tool processing) */
  localFiles: React.RefObject<Record<string, string>>
}

/**
 * Processes tool invocations from streaming AI messages.
 *
 * Handles: file writes/edits/deletes, project scaffolding, rename,
 * capture_preview, terminal tools, gate tools (present_plan, ask_user, checkpoint),
 * audit plans, manage_tasks, and the approval gate for destructive operations.
 */
export function useToolProcessor(props: UseToolProcessorProps): UseToolProcessorReturn {
  const {
    messages, files, projectId,
    onBulkFileUpdate, onFileDelete,
    pendingChangesRef,
    pendingApproval, setPendingApproval,
    approvedKeys, deniedKeys,
    sendMessage,
    setTasks, latestTasksRef, taskDebounceRef,
  } = props

  const processedInvs = useRef(new Set<string>())
  const localFiles = useRef<Record<string, string>>({})

  // Synchronous — must not be deferred via useEffect to avoid stale reads during tool processing
  localFiles.current = { ...files }

  useEffect(() => {
    clearMarkdownCache()
    // Clear processedInvs on project switch to prevent unbounded growth across projects
    processedInvs.current.clear()
  }, [projectId])

  // Live file extraction from tool invocations
  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue

      // v6: tool invocations are in message.parts as tool-call/tool-result/tool-<name> parts
      const parts = msg.parts as MessagePart[] | undefined

      // Extract tool invocations from parts (v6 generic, v6 named, and legacy formats)
      const invocations: ToolInvocation[] = []
      const seenToolCallIds = new Set<string>()
      if (parts) {
        for (const p of parts) {
          // v6 named format: type='tool-<name>' with state, input, output
          if (p.type?.startsWith('tool-') && p.type !== 'tool-call' && p.type !== 'tool-result' && p.type !== 'tool-invocation' && (p.toolName || p.state)) {
            const toolName = p.toolName || p.type.replace(/^tool-/, '')
            // Dedup: skip if we already processed this toolCallId
            if (p.toolCallId && seenToolCallIds.has(p.toolCallId)) continue
            if (p.toolCallId) seenToolCallIds.add(p.toolCallId)
            invocations.push({
              toolName,
              state: p.state === 'output-available' ? 'result'
                : p.state === 'input-available' ? 'call'
                : p.state || 'result',
              args: (p.input as Record<string, unknown>) || p.args || {},
              result: (p.output ?? p.result) as Record<string, unknown> | undefined,
            })
          }
          // v6 generic format: type='tool-call' (args available) or type='tool-result' (output available)
          else if ((p.type === 'tool-call' || p.type === 'tool-result') && p.toolName) {
            if (p.toolCallId && seenToolCallIds.has(p.toolCallId)) continue
            if (p.toolCallId) seenToolCallIds.add(p.toolCallId)
            invocations.push({
              toolName: p.toolName,
              state: p.type === 'tool-call' ? 'call' : 'result',
              args: (p.input as Record<string, unknown>) || p.args || {},
              result: (p.output ?? p.result) as Record<string, unknown> | undefined,
            })
          }
          // Legacy format from v4
          else if (p.type === 'tool-invocation' && p.toolInvocation) {
            invocations.push(p.toolInvocation)
          }
        }
      }
      // Also check legacy toolInvocations array
      const legacyInvs = (msg as PiUIMessage).toolInvocations
      if (legacyInvs) {
        for (const inv of legacyInvs) {
          invocations.push(inv)
        }
      }

      for (let i = 0; i < invocations.length; i++) {
        const inv = invocations[i]
        const key = `${msg.id}:${inv.toolName}:${i}`

        if (processedInvs.current.has(key)) continue

        const processAtCall = ['write_file', 'delete_file'].includes(inv.toolName)
        const processAtResult = ['edit_file', 'create_project', 'rename_file'].includes(inv.toolName)

        // v6 states: 'input-streaming', 'input-available', 'output-available', 'output-error'
        const isResult = inv.state === 'result' || inv.state === 'output-available'
        const isCall = inv.state === 'call' || inv.state === 'input-available'

        const shouldProcess =
          (processAtCall && (isCall || isResult)) ||
          (processAtResult && isResult)

        if (!shouldProcess) continue

        if (isResult && inv.result && typeof inv.result === 'object' && 'error' in inv.result) {
          processedInvs.current.add(key)
          continue
        }

        // ── Approval gate: check if this is a destructive tool ──
        const isDestructive = DESTRUCTIVE_TOOLS.has(inv.toolName) ||
          (inv.toolName === 'run_command' && typeof inv.args?.command === 'string' && DANGEROUS_COMMAND_PATTERNS.test(inv.args.command as string))

        if (isDestructive && !approvedKeys.current.has(key) && !deniedKeys.current.has(key)) {
          // Check localStorage for pre-approved tools
          let preApproved = false
          try {
            const stored = JSON.parse(localStorage.getItem('pi:approved-tools') || '[]')
            preApproved = stored.includes(inv.toolName)
          } catch { /* ignore */ }

          if (!preApproved) {
            // Show approval card but don't block other processing
            if (!pendingApproval || pendingApproval.key !== key) {
              setPendingApproval({ toolName: inv.toolName, args: inv.args || {}, key })
            }
            // Skip applying this tool's changes until approved
            if (inv.toolName === 'delete_file') continue
          }
        }

        if (deniedKeys.current.has(key)) {
          processedInvs.current.add(key)
          continue
        }

        // capture_preview — signal client to extract preview DOM content
        if (inv.toolName === 'capture_preview' && isResult) {
          processedInvs.current.add(key)
          window.dispatchEvent(new CustomEvent('pi:capture-preview', {
            detail: { messageId: msg.id, invocationIndex: i }
          }))
          continue
        }

        // Terminal tools — dispatch action event for workspace/terminal panel
        const terminalTools = ['run_command', 'install_package', 'run_dev_server', 'run_build', 'run_tests', 'check_types', 'verify_build']
        if (terminalTools.includes(inv.toolName) && isResult && inv.result) {
          const result = inv.result as Record<string, unknown>
          if (result.__terminal_action) {
            processedInvs.current.add(key)
            window.dispatchEvent(new CustomEvent('pi:terminal-action', {
              detail: result
            }))
            continue
          }
        }

        // ── Gate tools: present_plan, ask_user, checkpoint ──
        // These tools produce inline cards — mark as processed so they don't
        // trigger file extraction, but do NOT skip them (they render in message-item)
        if (['present_plan', 'ask_user', 'checkpoint'].includes(inv.toolName) && (isCall || isResult)) {
          const gateArgs = inv.args as Record<string, unknown>
          if (gateArgs?.__plan_gate || gateArgs?.__ask_gate || gateArgs?.__checkpoint || gateArgs?.files || gateArgs?.question) {
            processedInvs.current.add(key)
            // Check auto-approve for plans
            if (inv.toolName === 'present_plan' && (isCall || isResult)) {
              try {
                const autoApprove = localStorage.getItem('pi:auto-approve-plans') === 'true'
                if (autoApprove) {
                  sendMessage({ text: '[PLAN APPROVED]' })
                }
              } catch (e) { console.warn('[pi:plan] Failed to check auto-approve setting:', e) }
            }
            continue
          }
        }

        // Audit plan — dispatch event for workspace to display audit panel
        // AND mark as processed so the inline card renders
        if (inv.toolName === 'create_audit_plan' && (isCall || isResult)) {
          const result = (inv.result || inv.args) as Record<string, unknown>
          if (result?.__audit_gate || result?.plan || result?.findings) {
            processedInvs.current.add(key)
            window.dispatchEvent(new CustomEvent('pi:audit-plan', {
              detail: result.plan || result
            }))
            continue
          }
        }

        // Task list — extract tasks from manage_tasks tool (with deps/phases)
        // Debounced to prevent rapid re-renders during AI streaming
        if (inv.toolName === 'manage_tasks' && (isCall || isResult)) {
          const taskArgs = inv.args as { tasks?: Array<{ id: string; label: string; status: string; description?: string; blockedBy?: string[]; phase?: string }> }
          if (Array.isArray(taskArgs?.tasks)) {
            latestTasksRef.current = taskArgs.tasks
            if (!taskDebounceRef.current) {
              taskDebounceRef.current = setTimeout(() => {
                setTasks(latestTasksRef.current)
                taskDebounceRef.current = null
              }, 500)
            }
          }
          processedInvs.current.add(key)
          continue
        }

        const changes = extractFileUpdates(inv, localFiles.current)
        if (!changes) continue

        processedInvs.current.add(key)
        // Cap Set size — keep entries matching current messages, discard stale
        if (processedInvs.current.size > 1000) {
          const currentMsgIds = new Set(messages.map(m => m.id))
          const kept = [...processedInvs.current].filter(k => {
            const msgId = k.split(':')[0]
            return currentMsgIds.has(msgId)
          })
          processedInvs.current = new Set(kept.length > 500 ? kept.slice(-500) : kept)
        }

        if (changes.updates && Object.keys(changes.updates).length > 0) {
          for (const [path, content] of Object.entries(changes.updates)) {
            // Track whether this is a create or modify for the change summary
            const existed = path in localFiles.current
            if (existed) {
              pendingChangesRef.current.modified.add(path)
            } else {
              pendingChangesRef.current.created.add(path)
            }
            // If a file was "created" and then "modified" in the same turn, keep it as created
            if (pendingChangesRef.current.created.has(path)) {
              pendingChangesRef.current.modified.delete(path)
            }
            localFiles.current[path] = content
          }
          onBulkFileUpdate(changes.updates)
          // Signal workspace that AI edited these files (for highlight animation + diff badges)
          window.dispatchEvent(new CustomEvent('pi:file-edited', {
            detail: { paths: Object.keys(changes.updates) }
          }))
        }
        if (changes.deletes) {
          for (const path of changes.deletes) {
            pendingChangesRef.current.deleted.add(path)
            // If it was also created this turn, remove from both (net no change visible)
            if (pendingChangesRef.current.created.has(path)) {
              pendingChangesRef.current.created.delete(path)
              pendingChangesRef.current.deleted.delete(path)
            }
            pendingChangesRef.current.modified.delete(path)
            delete localFiles.current[path]
            onFileDelete(path)
          }
        }
      }
    }
  }, [messages, onBulkFileUpdate, onFileDelete]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    processedInvs,
    localFiles,
  }
}
