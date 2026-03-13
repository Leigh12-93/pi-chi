'use client'

import { memo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Circle, Loader2, XCircle, Lock, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TaskItem {
  id: string
  label: string
  status: string
  detail?: string
  description?: string
  blockedBy?: string[]
  phase?: string
}

interface TaskListPanelProps {
  tasks: TaskItem[]
  defaultCollapsed?: boolean
}

const STATUS_CONFIG: Record<string, { Icon: typeof Circle; color: string; bg: string }> = {
  pending: { Icon: Circle, color: 'text-pi-text-dim/40', bg: '' },
  in_progress: { Icon: Loader2, color: 'text-pi-accent', bg: 'bg-pi-accent/5' },
  completed: { Icon: CheckCircle, color: 'text-emerald-500', bg: '' },
  done: { Icon: CheckCircle, color: 'text-emerald-500', bg: '' },
  failed: { Icon: XCircle, color: 'text-red-500', bg: 'bg-red-50/50 dark:bg-red-950/10' },
  error: { Icon: XCircle, color: 'text-red-500', bg: 'bg-red-50/50 dark:bg-red-950/10' },
  blocked: { Icon: Lock, color: 'text-pi-text-dim/30', bg: 'bg-pi-surface/30' },
}

export const TaskListPanel = memo(function TaskListPanel({ tasks, defaultCollapsed = false }: TaskListPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  if (!tasks || tasks.length === 0) return null

  const done = tasks.filter(t => t.status === 'done' || t.status === 'completed').length
  const inProgress = tasks.find(t => t.status === 'in_progress')
  const total = tasks.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const allComplete = done === total

  // Find current task number (first in_progress, or last completed + 1)
  const currentIdx = tasks.findIndex(t => t.status === 'in_progress')
  const currentNum = currentIdx >= 0 ? currentIdx + 1 : done < total ? done + 1 : total

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="border border-pi-border rounded-xl overflow-hidden bg-pi-bg/50"
    >
      {/* Header — clickable to collapse/expand */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full px-3.5 py-2.5 border-b border-pi-border/50 flex items-center justify-between hover:bg-pi-surface/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: collapsed ? -90 : 0 }}
            transition={{ duration: 0.15 }}
          >
            <ChevronDown className="w-3.5 h-3.5 text-pi-text-dim/50" />
          </motion.div>
          <span className="text-[12px] font-medium text-pi-text-dim">
            {allComplete
              ? 'All tasks complete'
              : inProgress
                ? `Task ${currentNum} of ${total} in progress`
                : `${done} of ${total} tasks complete`
            }
          </span>
        </div>
        <span className={cn(
          'text-[11px] font-mono tabular-nums',
          allComplete ? 'text-emerald-500' : 'text-pi-text-dim/60',
        )}>
          {done}/{total} {pct > 0 && `(${pct}%)`}
        </span>
      </button>

      {/* Progress bar */}
      <div className="h-[2px] bg-pi-border/30">
        <motion.div
          className={cn('h-full', allComplete ? 'bg-emerald-500' : 'bg-pi-accent')}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      {/* Task items — collapsible */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-2 py-1.5">
              {(() => {
                const phases = ['explore', 'plan', 'build', 'verify', 'deploy'] as const
                const hasPhases = tasks.some(t => t.phase)

                const renderTask = (task: TaskItem) => {
                  const config = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending
                  const { Icon } = config
                  const isComplete = task.status === 'done' || task.status === 'completed'
                  const blockerLabels = task.blockedBy?.map(id => tasks.find(t => t.id === id)?.label).filter(Boolean)
                  return (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12.5px] transition-colors',
                        config.bg,
                      )}
                      title={task.description || undefined}
                    >
                      <motion.div
                        initial={isComplete ? { scale: 0.5 } : false}
                        animate={isComplete ? { scale: 1 } : undefined}
                        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                      >
                        <Icon className={cn(
                          'w-3.5 h-3.5 shrink-0',
                          config.color,
                          task.status === 'in_progress' && 'animate-spin',
                        )} />
                      </motion.div>
                      <span className={cn(
                        'flex-1 min-w-0 truncate transition-all duration-300',
                        isComplete ? 'text-pi-text-dim line-through' : 'text-pi-text',
                        (task.status === 'error' || task.status === 'failed') && 'text-red-500',
                        task.status === 'blocked' && 'text-pi-text-dim/40',
                      )}>
                        {task.label}
                      </span>
                      {task.status === 'blocked' && blockerLabels && blockerLabels.length > 0 && (
                        <span className="text-[9px] text-pi-text-dim/30 truncate max-w-[120px]" title={`Blocked by: ${blockerLabels.join(', ')}`}>
                          blocked
                        </span>
                      )}
                      {task.detail && task.status === 'error' && (
                        <span className="text-[10px] text-red-400 truncate max-w-[150px]">
                          {task.detail}
                        </span>
                      )}
                    </motion.div>
                  )
                }

                if (hasPhases) {
                  return phases.map(phase => {
                    const phaseTasks = tasks.filter(t => t.phase === phase)
                    if (phaseTasks.length === 0) return null
                    return (
                      <div key={phase}>
                        <div className="px-2 pt-2 pb-0.5 text-[10px] text-pi-text-dim/40 uppercase tracking-wider font-medium">{phase}</div>
                        {phaseTasks.map(renderTask)}
                      </div>
                    )
                  })
                }
                return tasks.map(renderTask)
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
})
