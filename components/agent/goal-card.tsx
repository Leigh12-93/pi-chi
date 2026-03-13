'use client'

import {
  CheckCircle2, Circle, Clock, Play, Pause,
  ChevronDown, ChevronRight, AlertTriangle,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { Goal } from '@/lib/agent-types'

interface GoalCardProps {
  goal: Goal
  expanded: boolean
  onToggle: () => void
}

const statusIcon = {
  active: <Play className="w-3.5 h-3.5 text-emerald-500" />,
  completed: <CheckCircle2 className="w-3.5 h-3.5 text-pi-success" />,
  paused: <Pause className="w-3.5 h-3.5 text-yellow-500" />,
  pending: <Clock className="w-3.5 h-3.5 text-pi-text-dim" />,
}

const priorityColor = {
  high: 'border-l-red-500',
  medium: 'border-l-yellow-500',
  low: 'border-l-blue-500',
}

export function GoalCard({ goal, expanded, onToggle }: GoalCardProps) {
  const completedTasks = goal.tasks.filter(t => t.status === 'done').length

  return (
    <div className={cn(
      'border border-pi-border rounded-lg bg-pi-surface/50 border-l-2 transition-all',
      priorityColor[goal.priority],
      goal.status === 'active' && 'ring-1 ring-pi-accent/20',
    )}>
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-2 p-3 text-left hover:bg-pi-surface-hover/50 transition-colors rounded-lg"
      >
        {statusIcon[goal.status]}
        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-xs font-medium',
            goal.status === 'completed' ? 'text-pi-text-dim line-through' : 'text-pi-text'
          )}>
            {goal.title}
          </p>
          <p className="text-[10px] text-pi-text-dim mt-0.5">
            {completedTasks}/{goal.tasks.length} tasks
          </p>
        </div>
        {expanded
          ? <ChevronDown className="w-3 h-3 text-pi-text-dim mt-0.5" />
          : <ChevronRight className="w-3 h-3 text-pi-text-dim mt-0.5" />
        }
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
            {goal.reasoning && (
              <p className="px-3 pb-2 text-[10px] text-pi-text-dim italic border-t border-pi-border/50 pt-2 mx-3">
                {goal.reasoning}
              </p>
            )}
            <div className="px-3 pb-3 space-y-1">
              {goal.tasks.map(task => (
                <div key={task.id} className="flex items-start gap-2 py-1">
                  {task.status === 'done' && <CheckCircle2 className="w-3 h-3 text-pi-success mt-0.5 shrink-0" />}
                  {task.status === 'running' && <div className="w-3 h-3 mt-0.5 shrink-0 rounded-full border-2 border-pi-accent border-t-transparent animate-spin" />}
                  {task.status === 'pending' && <Circle className="w-3 h-3 text-pi-text-dim/30 mt-0.5 shrink-0" />}
                  {task.status === 'failed' && <AlertTriangle className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />}
                  <div className="min-w-0">
                    <p className={cn(
                      'text-[11px]',
                      task.status === 'done' ? 'text-pi-text-dim line-through' :
                      task.status === 'running' ? 'text-pi-text font-medium shimmer-text' :
                      'text-pi-text-dim'
                    )}>
                      {task.title}
                    </p>
                    {task.detail && (
                      <p className="text-[10px] text-pi-text-dim/60 mt-0.5">{task.detail}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
