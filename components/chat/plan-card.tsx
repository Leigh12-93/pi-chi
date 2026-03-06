'use client'

import { useState } from 'react'
import { ClipboardList, ChevronRight, ChevronDown, Plus, Pencil, Trash2, AlertCircle, HelpCircle, CheckCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface PlanFile {
  path: string
  action: 'create' | 'modify' | 'delete'
  reason: string
}

export interface PlanAlternative {
  id: string
  label: string
  description: string
}

export interface PlanQuestion {
  id: string
  question: string
  options?: string[]
}

export interface PlanCardProps {
  plan: {
    summary: string
    approach: string
    files: PlanFile[]
    alternatives?: PlanAlternative[]
    questions?: PlanQuestion[]
    confidence: number
    uncertainties?: string[]
  }
  onApprove: (response: string) => void
  onReject: (reason: string) => void
}

const ACTION_CONFIG = {
  create: { icon: Plus, color: 'text-emerald-500', bg: 'bg-emerald-950/20', label: 'Create' },
  modify: { icon: Pencil, color: 'text-blue-400', bg: 'bg-blue-950/20', label: 'Modify' },
  delete: { icon: Trash2, color: 'text-red-400', bg: 'bg-red-950/20', label: 'Delete' },
}

function ConfidenceRing({ value }: { value: number }) {
  const radius = 14
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference
  const color = value >= 80 ? 'text-emerald-500' : value >= 50 ? 'text-amber-500' : 'text-red-500'
  return (
    <div className="relative w-9 h-9 shrink-0" title={`${value}% confidence`}>
      <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r={radius} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-forge-border/30" />
        <circle cx="18" cy="18" r={radius} fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className={color} />
      </svg>
      <span className={cn('absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums', color)}>
        {value}
      </span>
    </div>
  )
}

export function PlanCard({ plan, onApprove, onReject }: PlanCardProps) {
  const [expanded, setExpanded] = useState(true)
  const [selectedAlt, setSelectedAlt] = useState<string>(plan.alternatives?.[0]?.id || '')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [autoApprove] = useState(() => {
    try { return localStorage.getItem('forge:auto-approve-plans') === 'true' } catch { return false }
  })

  const creates = plan.files.filter(f => f.action === 'create').length
  const modifies = plan.files.filter(f => f.action === 'modify').length
  const deletes = plan.files.filter(f => f.action === 'delete').length

  const handleApprove = () => {
    setSubmitted(true)
    const parts: string[] = ['[PLAN APPROVED]']
    if (selectedAlt) parts.push(`User selected alternative: ${selectedAlt}.`)
    if (Object.keys(answers).length > 0) parts.push(`Answers: ${JSON.stringify(answers)}.`)
    if (notes.trim()) parts.push(`Notes: ${notes.trim()}`)
    onApprove(parts.join(' '))
  }

  const handleReject = () => {
    setSubmitted(true)
    onReject(`[PLAN REJECTED] Reason: ${rejectReason.trim() || 'No reason given'}`)
  }

  const handleAutoApproveToggle = (checked: boolean) => {
    try { localStorage.setItem('forge:auto-approve-plans', String(checked)) } catch {}
    if (checked) handleApprove()
  }

  if (submitted) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 py-2 text-[12px] text-forge-text-dim">
        <CheckCircle className="w-4 h-4 text-emerald-500" />
        <span>Plan response submitted</span>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="border border-purple-500/30 rounded-xl overflow-hidden bg-forge-bg/80 backdrop-blur-sm"
    >
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-purple-950/40 to-purple-900/20 border-b border-purple-500/20 flex items-center gap-3">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-purple-500/20">
          <ClipboardList className="w-3.5 h-3.5 text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-purple-300">Build Plan</div>
          <div className="text-[11px] text-forge-text-dim/60">
            {plan.files.length} files
            {creates > 0 && <span className="text-emerald-400"> · +{creates}</span>}
            {modifies > 0 && <span className="text-blue-400"> · ~{modifies}</span>}
            {deletes > 0 && <span className="text-red-400"> · -{deletes}</span>}
          </div>
        </div>
        <ConfidenceRing value={plan.confidence} />
        <button onClick={() => setExpanded(!expanded)} className="p-1 rounded-md hover:bg-forge-surface/50 transition-colors">
          <ChevronDown className={cn('w-4 h-4 text-forge-text-dim/40 transition-transform', !expanded && '-rotate-90')} />
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
            <div className="px-4 py-3 space-y-3">
              {/* Summary + Approach */}
              <div>
                <p className="text-[13px] text-forge-text font-medium">{plan.summary}</p>
                <p className="text-[12px] text-forge-text-dim/70 mt-1 leading-relaxed">{plan.approach}</p>
              </div>

              {/* File list */}
              <div className="space-y-1">
                <div className="text-[11px] text-forge-text-dim/50 uppercase tracking-wide font-medium">Files</div>
                {plan.files.map((file, i) => {
                  const config = ACTION_CONFIG[file.action]
                  const Icon = config.icon
                  return (
                    <div key={i} className={cn('flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px]', config.bg)} title={file.reason}>
                      <Icon className={cn('w-3 h-3 shrink-0', config.color)} />
                      <span className="font-mono text-[11.5px] text-forge-text/80 truncate flex-1">{file.path}</span>
                      <span className={cn('text-[10px] shrink-0', config.color)}>{config.label}</span>
                    </div>
                  )
                })}
              </div>

              {/* Alternatives */}
              {plan.alternatives && plan.alternatives.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] text-forge-text-dim/50 uppercase tracking-wide font-medium">Approach Options</div>
                  {plan.alternatives.map(alt => (
                    <label key={alt.id} className={cn(
                      'flex items-start gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-all',
                      selectedAlt === alt.id ? 'border-purple-500/40 bg-purple-950/20' : 'border-forge-border/30 hover:border-forge-border/60'
                    )}>
                      <input type="radio" name="plan-alt" value={alt.id} checked={selectedAlt === alt.id} onChange={() => setSelectedAlt(alt.id)} className="mt-0.5 accent-purple-500" />
                      <div>
                        <div className="text-[12px] text-forge-text font-medium">{alt.label}</div>
                        <div className="text-[11px] text-forge-text-dim/60">{alt.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {/* Questions */}
              {plan.questions && plan.questions.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] text-forge-text-dim/50 uppercase tracking-wide font-medium flex items-center gap-1.5">
                    <HelpCircle className="w-3 h-3" /> Questions
                  </div>
                  {plan.questions.map(q => (
                    <div key={q.id} className="space-y-1">
                      <div className="text-[12px] text-forge-text">{q.question}</div>
                      {q.options ? (
                        <div className="flex flex-wrap gap-1.5">
                          {q.options.map(opt => (
                            <button
                              key={opt}
                              onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt }))}
                              className={cn(
                                'px-2.5 py-1 rounded-md text-[11px] border transition-all',
                                answers[q.id] === opt ? 'border-purple-500/40 bg-purple-950/30 text-purple-300' : 'border-forge-border/30 text-forge-text-dim hover:border-forge-border/60'
                              )}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={answers[q.id] || ''}
                          onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                          placeholder="Your answer..."
                          className="w-full px-2.5 py-1.5 bg-forge-surface border border-forge-border/30 rounded-lg text-[12px] text-forge-text outline-none focus:border-purple-500/40 transition-colors"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Uncertainties */}
              {plan.uncertainties && plan.uncertainties.length > 0 && (
                <div className="px-3 py-2 rounded-lg bg-amber-950/15 border border-amber-500/20">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertCircle className="w-3 h-3 text-amber-500" />
                    <span className="text-[11px] text-amber-400 font-medium">Uncertainties</span>
                  </div>
                  {plan.uncertainties.map((u, i) => (
                    <div key={i} className="text-[11.5px] text-amber-300/70 leading-relaxed">· {u}</div>
                  ))}
                </div>
              )}

              {/* Notes area (toggle) */}
              {showNotes && (
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Additional notes for the AI..."
                  rows={2}
                  className="w-full px-3 py-2 bg-forge-surface border border-forge-border/30 rounded-lg text-[12px] text-forge-text outline-none resize-none focus:border-purple-500/40 transition-colors"
                />
              )}

              {/* Reject area */}
              {showReject && (
                <div className="space-y-2">
                  <textarea
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="Why are you rejecting? What should change?"
                    rows={2}
                    className="w-full px-3 py-2 bg-forge-surface border border-red-500/20 rounded-lg text-[12px] text-forge-text outline-none resize-none focus:border-red-500/40 transition-colors"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button onClick={handleReject} className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">
                      Confirm Reject
                    </button>
                    <button onClick={() => setShowReject(false)} className="px-3 py-1.5 rounded-lg text-[12px] text-forge-text-dim hover:text-forge-text transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Action bar */}
              {!showReject && (
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={handleApprove} className="px-4 py-2 rounded-lg text-[12px] font-semibold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/20 transition-all hover:border-emerald-500/40">
                    Approve & Build
                  </button>
                  <button onClick={() => { setShowNotes(!showNotes); setShowReject(false) }} className="px-3 py-2 rounded-lg text-[12px] text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-all border border-forge-border/30">
                    {showNotes ? 'Hide Notes' : 'Edit & Approve'}
                  </button>
                  <button onClick={() => { setShowReject(true); setShowNotes(false) }} className="px-3 py-2 rounded-lg text-[12px] text-red-400/70 hover:text-red-400 hover:bg-red-950/20 transition-all border border-red-500/10 hover:border-red-500/20">
                    Reject
                  </button>
                  <div className="flex-1" />
                  <label className="flex items-center gap-1.5 text-[10px] text-forge-text-dim/40 cursor-pointer select-none">
                    <input type="checkbox" defaultChecked={autoApprove} onChange={e => handleAutoApproveToggle(e.target.checked)} className="accent-purple-500 w-3 h-3" />
                    Auto-approve
                  </label>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
