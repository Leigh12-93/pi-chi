'use client'

import { useState } from 'react'
import {
  Shield, AlertTriangle, AlertCircle, Info, CheckCircle2,
  ChevronDown, ChevronRight, Play, RefreshCw, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface AuditFinding {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  category: string
  title: string
  description: string
  file: string
  fix: string
  effort: string
  status?: 'fixed' | 'skipped' | 'deferred'
  changes?: string
}

export interface AuditPlan {
  summary: string
  findings: AuditFinding[]
  stats: {
    filesAnalyzed: number
    issuesFound: number
    criticalCount: number
    estimatedFixTime: string
  }
  status: 'pending_approval' | 'in_progress' | 'completed'
  createdAt: string
}

interface AuditPanelProps {
  plan: AuditPlan | null
  onApprove: () => void
  onReplan: (feedback: string) => void
  onDismiss: () => void
}

const SEVERITY_CONFIG = {
  critical: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'Critical' },
  high: { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', label: 'High' },
  medium: { icon: Info, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', label: 'Medium' },
  low: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', label: 'Low' },
}

export function AuditPanel({ plan, onApprove, onReplan, onDismiss }: AuditPanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [replanFeedback, setReplanFeedback] = useState('')
  const [showReplanInput, setShowReplanInput] = useState(false)

  if (!plan) return null

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const fixedCount = plan.findings.filter(f => f.status === 'fixed').length
  const totalCount = plan.findings.length
  const progress = totalCount > 0 ? (fixedCount / totalCount) * 100 : 0

  return (
    <div className="border border-forge-border rounded-lg bg-forge-surface/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-forge-panel border-b border-forge-border">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-forge-accent" />
          <span className="text-xs font-medium text-forge-text">Audit Plan</span>
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
            plan.status === 'pending_approval' && 'bg-yellow-500/10 text-yellow-400',
            plan.status === 'in_progress' && 'bg-blue-500/10 text-blue-400',
            plan.status === 'completed' && 'bg-green-500/10 text-green-400',
          )}>
            {plan.status === 'pending_approval' ? 'Awaiting Approval' :
             plan.status === 'in_progress' ? `In Progress (${fixedCount}/${totalCount})` :
             'Completed'}
          </span>
        </div>
        <button onClick={onDismiss} className="p-1 text-forge-text-dim hover:text-forge-text rounded transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Summary */}
      <div className="px-3 py-2 text-xs text-forge-text-dim border-b border-forge-border">
        {plan.summary}
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] text-forge-text-dim border-b border-forge-border bg-forge-bg/50">
        <span>{plan.stats.filesAnalyzed} files analyzed</span>
        <span>{plan.stats.issuesFound} issues</span>
        <span>{plan.stats.criticalCount} critical</span>
        <span>{plan.stats.estimatedFixTime}</span>
      </div>

      {/* Progress bar */}
      {plan.status !== 'pending_approval' && (
        <div className="h-1 bg-forge-bg">
          <div
            className="h-full bg-forge-accent transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Findings list */}
      <div className="max-h-[400px] overflow-y-auto">
        {plan.findings.map(finding => {
          const config = SEVERITY_CONFIG[finding.severity]
          const Icon = config.icon
          const isExpanded = expandedIds.has(finding.id)

          return (
            <div key={finding.id} className={cn(
              'border-b border-forge-border/50 last:border-b-0',
              finding.status === 'fixed' && 'opacity-60',
            )}>
              <button
                onClick={() => toggleExpand(finding.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-forge-surface/80 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 text-forge-text-dim shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-forge-text-dim shrink-0" />
                )}
                <Icon className={cn('w-3.5 h-3.5 shrink-0', config.color)} />
                <span className="text-xs text-forge-text flex-1 truncate">{finding.id}: {finding.title}</span>
                <span className={cn('text-[9px] px-1.5 py-0.5 rounded', config.bg, config.color)}>
                  {config.label}
                </span>
                {finding.status === 'fixed' && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                )}
              </button>
              {isExpanded && (
                <div className="px-3 pb-2 pl-8 space-y-1">
                  <p className="text-[11px] text-forge-text-dim">{finding.description}</p>
                  <p className="text-[10px] text-forge-text-dim/70">
                    <span className="text-forge-text-dim">File:</span> {finding.file}
                    <span className="ml-2 text-forge-text-dim">Effort:</span> {finding.effort}
                  </p>
                  <p className="text-[10px] text-forge-accent/80">Fix: {finding.fix}</p>
                  {finding.changes && (
                    <p className="text-[10px] text-green-400/80">Changes: {finding.changes}</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Actions */}
      {plan.status === 'pending_approval' && (
        <div className="px-3 py-2 border-t border-forge-border bg-forge-panel space-y-2">
          {showReplanInput ? (
            <div className="space-y-2">
              <textarea
                value={replanFeedback}
                onChange={e => setReplanFeedback(e.target.value)}
                placeholder="What should be changed in the plan?"
                className="w-full px-2 py-1.5 text-xs bg-forge-bg border border-forge-border rounded resize-none h-16 text-forge-text placeholder:text-forge-text-dim/50 focus:outline-none focus:border-forge-accent"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { onReplan(replanFeedback); setShowReplanInput(false); setReplanFeedback('') }}
                  disabled={!replanFeedback.trim()}
                  className="px-3 py-1.5 text-xs font-medium bg-forge-accent text-white rounded hover:bg-forge-accent-hover disabled:opacity-50 transition-colors"
                >
                  Submit Feedback
                </button>
                <button
                  onClick={() => setShowReplanInput(false)}
                  className="px-3 py-1.5 text-xs text-forge-text-dim hover:text-forge-text rounded transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={onApprove}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-forge-accent text-white rounded hover:bg-forge-accent-hover transition-colors"
              >
                <Play className="w-3 h-3" />
                Approve & Execute
              </button>
              <button
                onClick={() => setShowReplanInput(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-forge-text-dim hover:text-forge-text border border-forge-border rounded hover:bg-forge-surface transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Replan
              </button>
            </div>
          )}
        </div>
      )}

      {plan.status === 'completed' && (
        <div className="px-3 py-2 border-t border-forge-border bg-green-500/5 text-center">
          <p className="text-xs text-green-400 font-medium">
            Audit complete — {fixedCount} of {totalCount} issues fixed
          </p>
        </div>
      )}
    </div>
  )
}
