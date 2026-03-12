'use client'

import { useState } from 'react'
import { HelpCircle, CheckCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface AskOption {
  id: string
  label: string
  description?: string
}

export interface AskCardProps {
  question: string
  context?: string
  options?: AskOption[]
  recommended?: string
  allowFreeText?: boolean
  onAnswer: (answer: string) => void
}

export function AskCard({ question, context, options, recommended, allowFreeText = true, onAnswer }: AskCardProps) {
  const [selected, setSelected] = useState<string>(recommended || '')
  const [freeText, setFreeText] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = () => {
    const answer = freeText.trim() || (options?.find(o => o.id === selected)?.label) || selected
    if (!answer) return
    setSubmitted(true)
    onAnswer(answer)
  }

  if (submitted) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 py-2 text-[12px] text-forge-text-dim">
        <CheckCircle className="w-4 h-4 text-emerald-500" />
        <span>Answer submitted</span>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="border border-blue-500/30 rounded-xl overflow-hidden bg-forge-bg/80 backdrop-blur-sm"
    >
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-blue-950/40 to-blue-900/20 border-b border-blue-500/20 flex items-center gap-3">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-blue-500/20">
          <HelpCircle className="w-3.5 h-3.5 text-blue-400" />
        </div>
        <span className="text-[13px] font-semibold text-blue-300">Six-Chi needs your input</span>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Context */}
        {context && (
          <p className="text-[12px] text-forge-text-dim/60 leading-relaxed">{context}</p>
        )}

        {/* Question */}
        <p className="text-[13px] text-forge-text font-medium">{question}</p>

        {/* Options */}
        {options && options.length > 0 && (
          <div className="space-y-1.5">
            {options.map(opt => (
              <label key={opt.id} className={cn(
                'flex items-start gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-all',
                selected === opt.id ? 'border-blue-500/40 bg-blue-950/20' : 'border-forge-border/30 hover:border-forge-border/60'
              )}>
                <input type="radio" name="ask-option" value={opt.id} checked={selected === opt.id} onChange={() => { setSelected(opt.id); setFreeText('') }} className="mt-0.5 accent-blue-500" />
                <div className="flex-1">
                  <div className="text-[12px] text-forge-text font-medium flex items-center gap-2">
                    {opt.label}
                    {opt.id === recommended && (
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold">Recommended</span>
                    )}
                  </div>
                  {opt.description && <div className="text-[11px] text-forge-text-dim/60 mt-0.5">{opt.description}</div>}
                </div>
              </label>
            ))}
          </div>
        )}

        {/* Free text input */}
        {allowFreeText && (
          <textarea
            value={freeText}
            onChange={e => { setFreeText(e.target.value); if (e.target.value) setSelected('') }}
            placeholder="Or type your own answer..."
            rows={2}
            className="w-full px-3 py-2 bg-forge-surface border border-forge-border/30 rounded-lg text-[12px] text-forge-text outline-none resize-none focus:border-blue-500/40 transition-colors"
          />
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!freeText.trim() && !selected}
          className={cn(
            'px-4 py-2 rounded-lg text-[12px] font-semibold transition-all border',
            (freeText.trim() || selected)
              ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border-blue-500/20 hover:border-blue-500/40'
              : 'bg-forge-surface text-forge-text-dim/30 border-forge-border/20 cursor-not-allowed'
          )}
        >
          Answer
        </button>
      </div>
    </motion.div>
  )
}
