'use client'

import { useState } from 'react'
import { Target, Plus } from 'lucide-react'
import type { Goal } from '@/lib/agent-types'
import { GoalCard } from './goal-card'

interface GoalsPanelProps {
  goals: Goal[]
  onNewGoal?: () => void
}

export function GoalsPanel({ goals, onNewGoal }: GoalsPanelProps) {
  const [expandedGoal, setExpandedGoal] = useState<string | null>(
    goals.find(g => g.status === 'active')?.id || null
  )

  const activeCount = goals.filter(g => g.status === 'active').length
  const completedCount = goals.filter(g => g.status === 'completed').length
  const runningTasks = goals.reduce(
    (acc, g) => acc + g.tasks.filter(t => t.status === 'running').length, 0
  )

  return (
    <div className="h-full flex flex-col bg-pi-panel border-r border-pi-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-pi-border">
        <div className="flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5 text-pi-accent" />
          <span className="text-xs font-semibold text-pi-text">Goals</span>
          <span className="text-[10px] text-pi-text-dim bg-pi-surface px-1.5 py-0.5 rounded-full">
            {activeCount} active
          </span>
        </div>
        {onNewGoal && (
          <button
            onClick={onNewGoal}
            className="p-1 rounded text-pi-text-dim hover:text-pi-accent hover:bg-pi-surface transition-colors"
            title="Add a new goal"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Goal list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {goals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-pi-text-dim">
            <Target className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-xs">No goals yet</p>
            <p className="text-[10px] mt-1">The AI will set goals autonomously</p>
          </div>
        ) : (
          goals.map(goal => (
            <GoalCard
              key={goal.id}
              goal={goal}
              expanded={expandedGoal === goal.id}
              onToggle={() => setExpandedGoal(prev => prev === goal.id ? null : goal.id)}
            />
          ))
        )}
      </div>

      {/* Footer summary */}
      <div className="px-3 py-2 border-t border-pi-border text-[10px] text-pi-text-dim flex items-center justify-between">
        <span>{completedCount} completed</span>
        <span className="text-pi-accent font-medium">{runningTasks} running</span>
      </div>
    </div>
  )
}
