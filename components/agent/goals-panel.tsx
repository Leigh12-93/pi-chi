'use client'

import { useState, useCallback } from 'react'
import {
  Target, Plus, X, Send, Filter,
  CheckCircle2, Clock, Pause, Play,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { Goal } from '@/lib/agent-types'
import { GoalCard } from './goal-card'

/* ─── Props ─────────────────────────────────────── */

interface GoalsPanelProps {
  goals: Goal[]
  onNewGoal?: () => void
  onInjectGoal?: (title: string, priority?: string, tasks?: string[]) => Promise<boolean>
}

/* ─── Filter type ───────────────────────────────── */

type GoalFilter = 'all' | 'active' | 'completed' | 'paused'

/* ─── Component ─────────────────────────────────── */

export function GoalsPanel({ goals, onInjectGoal }: GoalsPanelProps) {
  const [expandedGoal, setExpandedGoal] = useState<string | null>(
    goals.find(g => g.status === 'active')?.id || null
  )
  const [showInjectForm, setShowInjectForm] = useState(false)
  const [injectTitle, setInjectTitle] = useState('')
  const [injectPriority, setInjectPriority] = useState<'high' | 'medium' | 'low'>('medium')
  const [injecting, setInjecting] = useState(false)
  const [filter, setFilter] = useState<GoalFilter>('all')

  const activeCount = goals.filter(g => g.status === 'active').length
  const completedCount = goals.filter(g => g.status === 'completed').length
  const runningTasks = goals.reduce(
    (acc, g) => acc + g.tasks.filter(t => t.status === 'running').length, 0
  )

  const filteredGoals = filter === 'all'
    ? goals
    : goals.filter(g => g.status === filter)

  const handleInject = useCallback(async () => {
    if (!injectTitle.trim() || !onInjectGoal || injecting) return
    setInjecting(true)
    const ok = await onInjectGoal(injectTitle.trim(), injectPriority)
    if (ok) {
      setInjectTitle('')
      setShowInjectForm(false)
    }
    setInjecting(false)
  }, [injectTitle, injectPriority, onInjectGoal, injecting])

  return (
    <div className="h-full flex flex-col bg-pi-panel border-r border-pi-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-pi-border">
        <div className="flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5 text-pi-accent" />
          <span className="text-xs font-bold text-pi-text">Goals</span>
          <motion.span
            key={activeCount}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-[10px] text-pi-text-dim bg-pi-surface px-1.5 py-0.5 rounded-full font-mono"
          >
            {activeCount} active
          </motion.span>
        </div>
        <div className="flex items-center gap-1">
          {/* Filter dropdown */}
          <div className="relative group">
            <button
              className="p-1.5 rounded-lg text-pi-text-dim hover:text-pi-text hover:bg-pi-surface transition-all"
              title="Filter goals"
            >
              <Filter className="w-3 h-3" />
            </button>
            <div className="absolute right-0 top-full mt-1 bg-pi-surface border border-pi-border rounded-lg shadow-xl z-20 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all min-w-[120px]">
              {(['all', 'active', 'completed', 'paused'] as GoalFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'w-full text-left px-3 py-1.5 text-[11px] hover:bg-pi-surface-hover transition-colors first:rounded-t-lg last:rounded-b-lg flex items-center gap-2',
                    filter === f ? 'text-pi-accent font-medium' : 'text-pi-text-dim'
                  )}
                >
                  {f === 'active' && <Play className="w-2.5 h-2.5" />}
                  {f === 'completed' && <CheckCircle2 className="w-2.5 h-2.5" />}
                  {f === 'paused' && <Pause className="w-2.5 h-2.5" />}
                  {f === 'all' && <Target className="w-2.5 h-2.5" />}
                  <span className="capitalize">{f}</span>
                  <span className="ml-auto text-[9px] text-pi-text-dim/50 font-mono">
                    {f === 'all' ? goals.length : goals.filter(g => g.status === f).length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Add goal button */}
          {onInjectGoal && (
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowInjectForm(s => !s)}
              className={cn(
                'p-1.5 rounded-lg transition-all',
                showInjectForm
                  ? 'text-pi-danger bg-red-500/10 hover:bg-red-500/20'
                  : 'text-pi-text-dim hover:text-pi-accent hover:bg-pi-accent/10'
              )}
              title={showInjectForm ? 'Cancel' : 'Inject a new goal'}
            >
              {showInjectForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            </motion.button>
          )}
        </div>
      </div>

      {/* Inject form */}
      <AnimatePresence>
        {showInjectForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="overflow-hidden border-b border-pi-border"
          >
            <div className="p-3 space-y-2 bg-pi-accent/5">
              <input
                value={injectTitle}
                onChange={e => setInjectTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleInject()}
                placeholder="What should Pi-Chi work on?"
                className="w-full bg-pi-surface border border-pi-border rounded-lg px-3 py-2 text-xs text-pi-text placeholder:text-pi-text-dim/40 focus:outline-none focus:ring-1 focus:ring-pi-accent/50"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {(['high', 'medium', 'low'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setInjectPriority(p)}
                      className={cn(
                        'text-[9px] px-2 py-1 rounded-md font-medium transition-all',
                        injectPriority === p
                          ? p === 'high' ? 'bg-red-500/20 text-red-500 ring-1 ring-red-500/30'
                            : p === 'medium' ? 'bg-yellow-500/20 text-yellow-500 ring-1 ring-yellow-500/30'
                            : 'bg-blue-500/20 text-blue-500 ring-1 ring-blue-500/30'
                          : 'bg-pi-surface text-pi-text-dim hover:text-pi-text'
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={handleInject}
                  disabled={!injectTitle.trim() || injecting}
                  className={cn(
                    'ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all',
                    injectTitle.trim() && !injecting
                      ? 'bg-pi-accent text-white hover:bg-pi-accent-hover'
                      : 'bg-pi-surface text-pi-text-dim/30 cursor-not-allowed'
                  )}
                >
                  {injecting ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-3 h-3 border border-white/30 border-t-white rounded-full"
                    />
                  ) : (
                    <Send className="w-3 h-3" />
                  )}
                  Inject
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Goal list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {filteredGoals.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-8 text-pi-text-dim"
          >
            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Target className="w-8 h-8 mb-2 opacity-20" />
            </motion.div>
            <p className="text-xs font-medium">
              {filter === 'all' ? 'No goals yet' : `No ${filter} goals`}
            </p>
            <p className="text-[10px] mt-1 text-center max-w-[160px]">
              {filter === 'all'
                ? 'The brain will set goals autonomously, or you can inject one above.'
                : 'Try changing the filter to see other goals.'}
            </p>
          </motion.div>
        ) : (
          <AnimatePresence>
            {filteredGoals.map((goal, i) => (
              <motion.div
                key={goal.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: i * 0.03, type: 'spring', stiffness: 400, damping: 25 }}
              >
                <GoalCard
                  goal={goal}
                  expanded={expandedGoal === goal.id}
                  onToggle={() => setExpandedGoal(prev => prev === goal.id ? null : goal.id)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Footer summary */}
      <div className="px-3 py-2 border-t border-pi-border bg-pi-panel/50">
        <div className="flex items-center justify-between text-[10px] text-pi-text-dim">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-2.5 h-2.5 text-pi-success" />
              {completedCount} done
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-2.5 h-2.5 text-pi-text-dim" />
              {goals.filter(g => g.status === 'pending').length} pending
            </span>
          </div>
          <AnimatePresence>
            {runningTasks > 0 && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="text-pi-accent font-semibold flex items-center gap-1"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-pi-accent animate-pulse" />
                {runningTasks} running
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
