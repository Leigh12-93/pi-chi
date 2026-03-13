'use client'

import { useState } from 'react'
import { Flag, CheckCircle, ArrowRight, Eye } from 'lucide-react'
import { motion } from 'framer-motion'
// cn removed - unused

export interface CheckpointCardProps {
  phase: string
  completed: string[]
  nextPhase: string
  previewReady?: boolean
  question?: string
  onAnswer?: (answer: string) => void
}

export function CheckpointCard({ phase, completed, nextPhase, previewReady, question, onAnswer }: CheckpointCardProps) {
  const [answer, setAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleContinue = () => {
    if (question && onAnswer) {
      setSubmitted(true)
      onAnswer(answer.trim() || 'Continue')
    }
  }

  if (submitted) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 py-2 text-[12px] text-pi-text-dim">
        <CheckCircle className="w-4 h-4 text-emerald-500" />
        <span>Continuing to: {nextPhase}</span>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="border border-emerald-500/20 rounded-xl overflow-hidden bg-pi-bg/80"
    >
      {/* Header */}
      <div className="px-3.5 py-2.5 bg-gradient-to-r from-emerald-950/30 to-emerald-900/10 border-b border-emerald-500/15 flex items-center gap-2.5">
        <div className="w-5 h-5 rounded-md flex items-center justify-center bg-emerald-500/20">
          <Flag className="w-3 h-3 text-emerald-400" />
        </div>
        <span className="text-[12px] font-semibold text-emerald-300 flex-1">{phase}</span>
        <span className="text-[11px] text-emerald-400/60 font-mono tabular-nums">{completed.length} files</span>
        {previewReady && (
          <span className="flex items-center gap-1 text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
            <Eye className="w-2.5 h-2.5" /> Preview ready
          </span>
        )}
      </div>

      <div className="px-3.5 py-2.5 space-y-2">
        {/* Completed files */}
        <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
          {completed.map((file, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px]">
              <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
              <span className="font-mono text-pi-text-dim/60 truncate">{file}</span>
            </div>
          ))}
        </div>

        {/* Next phase */}
        <div className="flex items-center gap-2 pt-1 text-[12px] text-pi-text-dim/70">
          <ArrowRight className="w-3 h-3 text-pi-accent shrink-0" />
          <span>Next: <span className="text-pi-text font-medium">{nextPhase}</span></span>
        </div>

        {/* Question + Continue button */}
        {question && onAnswer && (
          <div className="space-y-2 pt-1">
            <p className="text-[12px] text-pi-text">{question}</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                placeholder="Your feedback (or just click Continue)..."
                className="flex-1 px-2.5 py-1.5 bg-pi-surface border border-pi-border/30 rounded-lg text-[12px] text-pi-text outline-none focus:border-emerald-500/40 transition-colors"
                onKeyDown={e => { if (e.key === 'Enter') handleContinue() }}
              />
              <button onClick={handleContinue} className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/20 transition-all">
                Continue
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
