'use client'

import { memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Circle, Loader2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TaskItem {
  id: string
  label: string
  status: 'pending' | 'in_progress' | 'done' | 'error'
  detail?: string
}

interface TaskListPanelProps {
  tasks: TaskItem[]
}

const STATUS_CONFIG = {
  pending: { Icon: Circle, color: 'text-forge-text-dim/40', bg: '' },
  in_progress: { Icon: Loader2, color: 'text-forge-accent', bg: 'bg-forge-accent/5' },
  done: { Icon: CheckCircle, color: 'text-emerald-500', bg: '' },
  error: { Icon: XCircle, color: 'text-red-500', bg: 'bg-red-50/50 dark:bg-red-950/10' },
}

export const TaskListPanel = memo(function TaskListPanel({ tasks }: TaskListPanelProps) {
  if (!tasks || tasks.length === 0) return null

  const done = tasks.filter(t => t.status === 'done').length
  const total = tasks.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="border border-forge-border rounded-xl overflow-hidden bg-forge-bg/50"
    >
      {/* Progress header */}
      <div className="px-3.5 py-2.5 border-b border-forge-border/50 flex items-center justify-between">
        <span className="text-[12px] font-medium text-forge-text-dim">
          Progress
        </span>
        <span className="text-[11px] text-forge-text-dim/60 font-mono tabular-nums">
          {done}/{total} {pct > 0 && `(${pct}%)`}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-[2px] bg-forge-border/30">
        <motion.div
          className="h-full bg-forge-accent"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      {/* Task items */}
      <div className="px-2 py-1.5">
        <AnimatePresence mode="popLayout">
          {tasks.map((task) => {
            const config = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending
            const { Icon } = config
            return (
              <motion.div
                key={task.id}
                layout
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12.5px] transition-colors',
                  config.bg,
                )}
              >
                <Icon className={cn(
                  'w-3.5 h-3.5 shrink-0',
                  config.color,
                  task.status === 'in_progress' && 'animate-spin',
                )} />
                <span className={cn(
                  'flex-1 min-w-0 truncate',
                  task.status === 'done' ? 'text-forge-text-dim line-through' : 'text-forge-text',
                  task.status === 'error' && 'text-red-500',
                )}>
                  {task.label}
                </span>
                {task.detail && task.status === 'error' && (
                  <span className="text-[10px] text-red-400 truncate max-w-[150px]">
                    {task.detail}
                  </span>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  )
})
