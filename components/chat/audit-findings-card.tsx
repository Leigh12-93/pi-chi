'use client'

import { useState, useMemo } from 'react'
import { Shield, ChevronDown, ChevronRight, AlertCircle, AlertTriangle, Info, Lightbulb, CheckCircle, Lock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

interface AuditFinding {
  id: string
  severity: 'critical' | 'warning' | 'info' | 'suggestion'
  category: string
  title: string
  description: string
  file?: string
  affectedFiles?: string[]
  currentPattern?: string
  suggestedPattern?: string
  effort: 'trivial' | 'small' | 'medium' | 'large'
}

interface AuditStats {
  totalFiles: number
  filesScanned: number
  criticalCount: number
  warningCount: number
  infoCount: number
}

export interface AuditFindingsCardProps {
  findings: {
    summary: string
    overallHealth: 'healthy' | 'minor_issues' | 'needs_attention' | 'critical'
    findings: AuditFinding[]
    stats: AuditStats
  }
  onFixSelected: (findingIds: string[]) => void
  onDismiss: () => void
}

const SEVERITY_CONFIG = {
  critical: { Icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-950/20', border: 'border-red-500/20', label: 'Critical' },
  warning: { Icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-950/20', border: 'border-amber-500/20', label: 'Warning' },
  info: { Icon: Info, color: 'text-blue-400', bg: 'bg-blue-950/20', border: 'border-blue-500/20', label: 'Info' },
  suggestion: { Icon: Lightbulb, color: 'text-purple-400', bg: 'bg-purple-950/20', border: 'border-purple-500/20', label: 'Suggestion' },
}

const HEALTH_CONFIG = {
  healthy: { color: 'text-emerald-400', bg: 'bg-emerald-500/20', label: 'Healthy' },
  minor_issues: { color: 'text-amber-400', bg: 'bg-amber-500/20', label: 'Minor Issues' },
  needs_attention: { color: 'text-orange-400', bg: 'bg-orange-500/20', label: 'Needs Attention' },
  critical: { color: 'text-red-400', bg: 'bg-red-500/20', label: 'Critical' },
}

const EFFORT_LABELS = { trivial: 'Trivial', small: 'Small', medium: 'Medium', large: 'Large' }

function FindingRow({ finding, decision, onDecide, expanded, onToggle }: {
  finding: AuditFinding
  decision: 'fix' | 'leave' | null
  onDecide: (d: 'fix' | 'leave') => void
  expanded: boolean
  onToggle: () => void
}) {
  const config = SEVERITY_CONFIG[finding.severity]
  const Icon = config.Icon

  return (
    <div className={cn('rounded-lg border transition-all', decision === 'fix' ? 'border-emerald-500/20 bg-emerald-950/10' : decision === 'leave' ? 'border-forge-border/10 opacity-50' : config.border, config.bg)}>
      <div className="flex items-center gap-2.5 px-3 py-2">
        <Icon className={cn('w-3.5 h-3.5 shrink-0', config.color)} />
        <button onClick={onToggle} className="flex-1 min-w-0 text-left flex items-center gap-1.5">
          <span className="text-[12px] text-forge-text font-medium truncate">{finding.title}</span>
          <span className="text-[10px] text-forge-text-dim/40 shrink-0 px-1 py-0.5 rounded bg-forge-surface">{finding.category}</span>
          <span className="text-[10px] text-forge-text-dim/30 shrink-0">{EFFORT_LABELS[finding.effort]}</span>
          <ChevronRight className={cn('w-3 h-3 text-forge-text-dim/30 transition-transform shrink-0', expanded && 'rotate-90')} />
        </button>
        {decision === null ? (
          <div className="flex gap-1.5 shrink-0">
            <button onClick={() => onDecide('fix')} className="px-2 py-1 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors">Fix</button>
            <button onClick={() => onDecide('leave')} className="px-2 py-1 rounded text-[10px] text-forge-text-dim/50 hover:text-forge-text-dim hover:bg-forge-surface transition-colors">Leave</button>
          </div>
        ) : decision === 'fix' ? (
          <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1 shrink-0">
            <CheckCircle className="w-3 h-3" /> Will fix
          </span>
        ) : (
          <span className="text-[10px] text-forge-text-dim/30 shrink-0">Skipped</span>
        )}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-3 pb-2.5 pt-0.5 space-y-2 border-t border-forge-border/10">
              <p className="text-[11.5px] text-forge-text-dim/70 leading-relaxed">{finding.description}</p>
              {finding.currentPattern && (
                <div>
                  <div className="text-[10px] text-forge-text-dim/40 uppercase tracking-wide mb-0.5">Current</div>
                  <pre className="text-[11px] font-mono text-red-300/60 bg-red-950/10 px-2 py-1 rounded whitespace-pre-wrap">{finding.currentPattern}</pre>
                </div>
              )}
              {finding.suggestedPattern && (
                <div>
                  <div className="text-[10px] text-forge-text-dim/40 uppercase tracking-wide mb-0.5">Suggested</div>
                  <pre className="text-[11px] font-mono text-emerald-300/60 bg-emerald-950/10 px-2 py-1 rounded whitespace-pre-wrap">{finding.suggestedPattern}</pre>
                </div>
              )}
              {finding.file && (
                <div className="text-[10px] text-forge-text-dim/40 font-mono">{finding.file}{finding.affectedFiles && finding.affectedFiles.length > 1 ? ` (+${finding.affectedFiles.length - 1} more)` : ''}</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function AuditFindingsCard({ findings: data, onFixSelected, onDismiss }: AuditFindingsCardProps) {
  const [decisions, setDecisions] = useState<Record<string, 'fix' | 'leave'>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const healthConfig = HEALTH_CONFIG[data.overallHealth]
  const fixCount = Object.values(decisions).filter(d => d === 'fix').length
  const allDecided = Object.keys(decisions).length === data.findings.length

  const sortedFindings = useMemo(() => {
    const order = { critical: 0, warning: 1, info: 2, suggestion: 3 }
    return [...data.findings].sort((a, b) => order[a.severity] - order[b.severity])
  }, [data.findings])

  const handleFixAll = () => {
    const all: Record<string, 'fix'> = {}
    data.findings.forEach(f => { all[f.id] = 'fix' })
    setDecisions(all)
  }

  const handleFixCritical = () => {
    const critical: Record<string, 'fix' | 'leave'> = { ...decisions }
    data.findings.forEach(f => {
      if (f.severity === 'critical') critical[f.id] = 'fix'
    })
    setDecisions(critical)
  }

  const handleLeaveAll = () => {
    const all: Record<string, 'leave'> = {}
    data.findings.forEach(f => { all[f.id] = 'leave' })
    setDecisions(all)
  }

  const handleSubmitFixes = () => {
    const toFix = Object.entries(decisions).filter(([_, d]) => d === 'fix').map(([id]) => id)
    setSubmitted(true)
    onFixSelected(toFix)
  }

  const handleDismiss = () => {
    setSubmitted(true)
    onDismiss()
  }

  if (submitted) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 py-2 text-[12px] text-forge-text-dim">
        <CheckCircle className="w-4 h-4 text-emerald-500" />
        <span>{fixCount > 0 ? `${fixCount} findings queued for fixing` : 'Audit dismissed'}</span>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="border border-amber-500/20 rounded-xl overflow-hidden bg-forge-bg/80 backdrop-blur-sm"
    >
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-amber-950/30 to-amber-900/10 border-b border-amber-500/15 flex items-center gap-3">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-amber-500/20">
          <Shield className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-amber-300">Codebase Audit</div>
          <div className="text-[11px] text-forge-text-dim/60">
            {data.stats.filesScanned} files scanned
            {data.stats.criticalCount > 0 && <span className="text-red-400"> · {data.stats.criticalCount} critical</span>}
            {data.stats.warningCount > 0 && <span className="text-amber-400"> · {data.stats.warningCount} warnings</span>}
          </div>
        </div>
        <span className={cn('px-2 py-1 rounded-md text-[11px] font-medium', healthConfig.bg, healthConfig.color)}>
          {healthConfig.label}
        </span>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Summary */}
        <p className="text-[12.5px] text-forge-text/80 leading-relaxed">{data.summary}</p>

        {/* Batch actions */}
        <div className="flex gap-2 flex-wrap">
          {data.stats.criticalCount > 0 && (
            <button onClick={handleFixCritical} className="px-2.5 py-1 rounded text-[10px] font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors border border-red-500/10">
              Fix All Critical
            </button>
          )}
          <button onClick={handleFixAll} className="px-2.5 py-1 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors border border-emerald-500/10">
            Fix All
          </button>
          <button onClick={handleLeaveAll} className="px-2.5 py-1 rounded text-[10px] text-forge-text-dim/40 hover:text-forge-text-dim hover:bg-forge-surface transition-colors">
            Leave All
          </button>
        </div>

        {/* Findings list */}
        <div className="space-y-1.5">
          {sortedFindings.map(finding => (
            <FindingRow
              key={finding.id}
              finding={finding}
              decision={decisions[finding.id] || null}
              onDecide={d => setDecisions(prev => ({ ...prev, [finding.id]: d }))}
              expanded={expandedId === finding.id}
              onToggle={() => setExpandedId(expandedId === finding.id ? null : finding.id)}
            />
          ))}
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 pt-1">
          {fixCount > 0 ? (
            <button onClick={handleSubmitFixes} className="px-4 py-2 rounded-lg text-[12px] font-semibold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/20 transition-all hover:border-emerald-500/40">
              Plan & Fix {fixCount} {fixCount === 1 ? 'Finding' : 'Findings'}
            </button>
          ) : (
            <button disabled className="px-4 py-2 rounded-lg text-[12px] font-semibold bg-forge-surface text-forge-text-dim/30 border border-forge-border/20 cursor-not-allowed">
              Select findings to fix
            </button>
          )}
          <button onClick={handleDismiss} className="px-3 py-2 rounded-lg text-[12px] text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-all border border-forge-border/30">
            Done — No Fixes Needed
          </button>
          {allDecided && (
            <span className="text-[11px] text-forge-text-dim/40 ml-auto">
              {fixCount} of {data.findings.length} selected
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}
