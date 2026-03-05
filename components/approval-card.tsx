'use client'

import { useState } from 'react'
import { ShieldAlert, Check, X, Terminal, Database, Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

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
    default: return ShieldAlert
  }
}

function getDescription(toolName: string, args: Record<string, unknown>): { title: string; detail: string } {
  switch (toolName) {
    case 'delete_file':
      return {
        title: 'Delete file',
        detail: String(args.path || 'unknown file'),
      }
    case 'db_mutate': {
      const op = String(args.operation || 'modify').toUpperCase()
      const table = String(args.table || 'unknown')
      return {
        title: `${op} database`,
        detail: `${op} on ${table}`,
      }
    }
    case 'run_command':
      return {
        title: 'Run destructive command',
        detail: String(args.command || '').slice(0, 120),
      }
    default:
      return {
        title: 'Destructive operation',
        detail: toolName,
      }
  }
}

export function ApprovalCard({ toolName, args, onApprove, onDeny }: ApprovalCardProps) {
  const [alwaysAllow, setAlwaysAllow] = useState(false)
  const Icon = getToolIcon(toolName)
  const { title, detail } = getDescription(toolName, args)

  const handleApprove = () => {
    if (alwaysAllow) {
      try {
        const stored = JSON.parse(localStorage.getItem('forge:approved-tools') || '[]')
        if (!stored.includes(toolName)) {
          stored.push(toolName)
          localStorage.setItem('forge:approved-tools', JSON.stringify(stored))
        }
      } catch { /* localStorage unavailable */ }
    }
    onApprove()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl p-3.5 text-[12.5px]"
    >
      <div className="flex items-start gap-2.5">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 bg-amber-100 dark:bg-amber-900/50 mt-0.5">
          <Icon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-amber-700 dark:text-amber-400 mb-0.5">{title}</p>
          <pre className="text-[11.5px] text-amber-600/80 dark:text-amber-300/70 font-mono whitespace-pre-wrap break-all bg-amber-100/50 dark:bg-amber-950/30 rounded-md px-2 py-1.5 border border-amber-200/50 dark:border-amber-800/30">
            {detail}
          </pre>
          <div className="flex items-center justify-between mt-2.5">
            <label className="flex items-center gap-1.5 text-[11px] text-amber-600/70 dark:text-amber-400/60 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={alwaysAllow}
                onChange={e => setAlwaysAllow(e.target.checked)}
                className="w-3 h-3 rounded border-amber-300 dark:border-amber-700 text-amber-600 focus:ring-amber-500/30"
              />
              Always allow {toolName.replace(/_/g, ' ')}
            </label>
            <div className="flex items-center gap-1.5">
              <button
                onClick={onDeny}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-800/50 rounded-lg transition-colors"
              >
                <X className="w-3 h-3" />
                Deny
              </button>
              <button
                onClick={handleApprove}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-white bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500 rounded-lg transition-colors"
              >
                <Check className="w-3 h-3" />
                Approve
              </button>
            </div>
          </div>
        </div>
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
