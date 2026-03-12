'use client'

import { useState, useEffect, useRef } from 'react'
import { ShieldAlert, Check, X, Terminal, Database, Trash2, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'

interface ApprovalCardProps {
  toolName: string
  args: Record<string, unknown>
  onApprove: () => void
  onDeny: () => void
}

function getToolIcon(toolName: string) {
  switch (toolName) {
    case 'delete_file': return Trash2
    case 'db_mutate': return Database
    case 'run_command': return Terminal
    case 'forge_modify_own_source':
    case 'forge_redeploy':
    case 'forge_revert_commit':
    case 'forge_merge_pr': return ShieldAlert
    case 'github_modify_external_file': return ShieldAlert
    case 'google_gmail_send': return ShieldAlert
    default: return ShieldAlert
  }
}

function getDescription(toolName: string, args: Record<string, unknown>): { title: string; detail: string } {
  switch (toolName) {
    case 'delete_file':
      return { title: 'Delete file', detail: String(args.path || 'unknown file') }
    case 'db_mutate': {
      const op = String(args.operation || 'modify').toUpperCase()
      const table = String(args.table || 'unknown')
      return { title: `${op} database`, detail: `${op} on ${table}` }
    }
    case 'run_command':
      return { title: 'Run destructive command', detail: String(args.command || '').slice(0, 120) }
    case 'forge_modify_own_source':
      return { title: 'Modify Forge source code', detail: `File: ${String(args.path || args.file || 'unknown')}` }
    case 'forge_redeploy':
      return { title: 'Redeploy Forge', detail: 'Trigger production redeployment' }
    case 'forge_revert_commit':
      return { title: 'Revert commit', detail: `SHA: ${String(args.sha || args.commit || 'unknown').slice(0, 12)}` }
    case 'forge_merge_pr':
      return { title: 'Merge pull request', detail: `PR #${String(args.pr_number || args.number || 'unknown')}` }
    case 'github_modify_external_file':
      return { title: 'Modify external repo file', detail: `${String(args.owner || '')}/${String(args.repo || '')}: ${String(args.path || '')}` }
    case 'google_gmail_send':
      return { title: 'Send email via Gmail', detail: `To: ${String(args.to || 'unknown')} — ${String(args.subject || '').slice(0, 60)}` }
    default:
      return { title: 'Destructive operation', detail: toolName.replace(/_/g, ' ') }
  }
}

export function ApprovalCard({ toolName, args, onApprove, onDeny }: ApprovalCardProps) {
  const [alwaysAllow, setAlwaysAllow] = useState(false)
  const [approving, setApproving] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const Icon = getToolIcon(toolName)
  const { title, detail } = getDescription(toolName, args)

  // Auto-deny after 60s
  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      toast.info('Approval timed out — operation denied', { duration: 3000 })
      onDeny()
    }, 60000)
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [onDeny])

  const handleApprove = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (alwaysAllow) {
      try {
        const stored = JSON.parse(localStorage.getItem('forge:approved-tools') || '[]')
        if (!stored.includes(toolName)) {
          stored.push(toolName)
          localStorage.setItem('forge:approved-tools', JSON.stringify(stored))
        }
      } catch { /* localStorage unavailable */ }
    }
    setApproving(true)
    onApprove()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl p-3.5 text-[12.5px] animate-approval-pulse"
      role="alertdialog"
      aria-labelledby="approval-title"
      aria-describedby="approval-detail"
    >
      <div className="flex items-start gap-2.5">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 bg-amber-100 dark:bg-amber-900/50 mt-0.5 approval-icon-glow">
          <Icon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p id="approval-title" className="font-medium text-amber-700 dark:text-amber-400 mb-0.5">{title}</p>
          <pre id="approval-detail" className="text-[11.5px] text-amber-600/80 dark:text-amber-300/70 font-mono whitespace-pre-wrap break-all bg-amber-100/50 dark:bg-amber-950/30 rounded-md px-2 py-1.5 border border-amber-200/50 dark:border-amber-800/30">
            {detail}
          </pre>
          <div className="flex items-center justify-between mt-2.5">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[11px] text-amber-600/70 dark:text-amber-400/60 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={alwaysAllow}
                  onChange={e => setAlwaysAllow(e.target.checked)}
                  className="w-3 h-3 rounded border-amber-300 dark:border-amber-700 text-amber-600 focus:ring-amber-500/30"
                />
                Always allow
              </label>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { if (timeoutRef.current) clearTimeout(timeoutRef.current); onDeny() }}
                aria-label="Deny operation"
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-800/50 active:scale-95 rounded-lg transition-all duration-150 hover:shadow-sm"
              >
                <X className="w-3 h-3" />
                Deny
              </button>
              <button
                onClick={handleApprove}
                disabled={approving}
                aria-label="Approve operation"
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-white bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500 active:scale-95 rounded-lg transition-all duration-150 hover:shadow-md hover:shadow-amber-500/20 disabled:opacity-60 disabled:active:scale-100"
              >
                {approving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                {approving ? 'Approving...' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Timeout countdown bar */}
      <div className="mt-2 h-0.5 w-full bg-amber-200/30 dark:bg-amber-800/20 rounded-full overflow-hidden">
        <div className="h-full bg-amber-400 dark:bg-amber-500 rounded-full approval-drain-bar" />
      </div>
    </motion.div>
  )
}

/** Check if a tool is pre-approved via localStorage */
export function isToolPreApproved(toolName: string): boolean {
  try {
    const stored = JSON.parse(localStorage.getItem('forge:approved-tools') || '[]')
    return stored.includes(toolName)
  } catch {
    return false
  }
}

/** Check if a run_command is destructive based on the command string */
export function isDestructiveCommand(command: string): boolean {
  const { DANGEROUS_COMMAND_PATTERNS } = require('@/lib/chat/constants')
  return DANGEROUS_COMMAND_PATTERNS.test(command)
}

export type ToolPermission = 'ask' | 'allow' | 'deny'

export function getToolPermission(toolName: string): ToolPermission {
  try {
    const config = JSON.parse(localStorage.getItem('forge:tool-permissions') || '{}')
    if (config[toolName]) return config[toolName]
  } catch {}
  if (isToolPreApproved(toolName)) return 'allow'
  return 'ask'
}

export function setToolPermission(toolName: string, permission: ToolPermission) {
  try {
    const config = JSON.parse(localStorage.getItem('forge:tool-permissions') || '{}')
    config[toolName] = permission
    localStorage.setItem('forge:tool-permissions', JSON.stringify(config))
  } catch {}
}
