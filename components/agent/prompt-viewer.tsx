'use client'

import { useState, useMemo } from 'react'
import {
  ScrollText, ChevronDown, Clock,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { PromptEvolution } from '@/lib/brain/brain-types'

/* ─── Props ─────────────────────────────────────── */

interface PromptViewerProps {
  promptOverrides: string
  promptEvolutions?: PromptEvolution[]
}

/* ─── Helpers ───────────────────────────────────── */

function formatRelativeTime(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime()
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return `${Math.floor(diff / 86400000)}d ago`
  } catch { return '' }
}

const categoryConfig: Record<string, { color: string; bgColor: string }> = {
  principle: { color: 'text-purple-500', bgColor: 'bg-purple-500/10 border-purple-500/20' },
  preference: { color: 'text-blue-500', bgColor: 'bg-blue-500/10 border-blue-500/20' },
  skill: { color: 'text-emerald-500', bgColor: 'bg-emerald-500/10 border-emerald-500/20' },
  personality: { color: 'text-pink-500', bgColor: 'bg-pink-500/10 border-pink-500/20' },
  rule: { color: 'text-orange-500', bgColor: 'bg-orange-500/10 border-orange-500/20' },
}

/* ─── Component ─────────────────────────────────── */

export function PromptViewer({ promptOverrides, promptEvolutions }: PromptViewerProps) {
  const [evolutionsOpen, setEvolutionsOpen] = useState(true)
  const [overridesOpen, setOverridesOpen] = useState(true)

  // Split raw overrides into sections by double newline
  const sections = useMemo(() => {
    if (!promptOverrides.trim()) return []
    return promptOverrides
      .split(/\n\n+/)
      .map(s => s.trim())
      .filter(Boolean)
  }, [promptOverrides])

  const activeEvolutions = useMemo(() => {
    if (!promptEvolutions) return []
    return promptEvolutions.filter(e => e.active)
  }, [promptEvolutions])

  const hasContent = sections.length > 0 || activeEvolutions.length > 0

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-pi-border bg-pi-panel/80 backdrop-blur-sm">
        <ScrollText className="w-3.5 h-3.5 text-pi-accent" />
        <span className="text-xs font-bold text-pi-text">Prompt DNA</span>
        {hasContent && (
          <span className="text-[10px] text-pi-text-dim bg-pi-surface px-1.5 py-0.5 rounded-full font-mono">
            {sections.length + activeEvolutions.length}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!hasContent ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-12 text-pi-text-dim"
          >
            <ScrollText className="w-10 h-10 mb-3 opacity-15" />
            <p className="text-xs font-medium">No prompt overrides yet</p>
            <p className="text-[10px] mt-1 text-center max-w-[200px]">
              The brain will evolve its own instructions here as it grows.
            </p>
          </motion.div>
        ) : (
          <>
            {/* Structured evolutions */}
            {activeEvolutions.length > 0 && (
              <div>
                <button
                  onClick={() => setEvolutionsOpen(o => !o)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-pi-surface/50 transition-colors"
                  aria-expanded={evolutionsOpen}
                >
                  <span className="text-[11px] font-bold text-pi-text uppercase tracking-wider">Evolutions</span>
                  <span className="text-[9px] text-pi-text-dim bg-pi-surface px-1.5 py-0.5 rounded-full font-mono">
                    {activeEvolutions.length}
                  </span>
                  <motion.div
                    animate={{ rotate: evolutionsOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="ml-auto"
                  >
                    <ChevronDown className="w-3.5 h-3.5 text-pi-text-dim" />
                  </motion.div>
                </button>
                <AnimatePresence initial={false}>
                  {evolutionsOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3 space-y-2">
                        {activeEvolutions.map((evo, i) => {
                          const cfg = categoryConfig[evo.category] || categoryConfig.rule
                          return (
                            <motion.div
                              key={evo.id}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.03, type: 'spring', stiffness: 400, damping: 25 }}
                              className="border border-pi-border rounded-lg bg-pi-surface/50 p-2.5"
                            >
                              <div className="flex items-start justify-between gap-2 mb-1.5">
                                <span className={cn(
                                  'text-[8px] px-1.5 py-px rounded-full font-medium border capitalize',
                                  cfg.bgColor, cfg.color
                                )}>
                                  {evo.category}
                                </span>
                                <div className="flex items-center gap-1 text-[9px] text-pi-text-dim/40 font-mono shrink-0">
                                  <Clock className="w-2.5 h-2.5" />
                                  {formatRelativeTime(evo.addedAt)}
                                </div>
                              </div>
                              <p className="text-[11px] text-pi-text font-mono leading-relaxed whitespace-pre-wrap">
                                {evo.content}
                              </p>
                              {evo.reasoning && (
                                <p className="text-[9px] text-pi-text-dim mt-1.5 italic leading-relaxed">
                                  {evo.reasoning}
                                </p>
                              )}
                              <span className="text-[8px] text-pi-text-dim/30 font-mono mt-1 block">
                                cycle #{evo.cycleNumber}
                              </span>
                            </motion.div>
                          )
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Raw prompt overrides */}
            {sections.length > 0 && (
              <div>
                <button
                  onClick={() => setOverridesOpen(o => !o)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-pi-surface/50 transition-colors"
                  aria-expanded={overridesOpen}
                >
                  <span className="text-[11px] font-bold text-pi-text uppercase tracking-wider">Raw Overrides</span>
                  <span className="text-[9px] text-pi-text-dim bg-pi-surface px-1.5 py-0.5 rounded-full font-mono">
                    {sections.length}
                  </span>
                  <motion.div
                    animate={{ rotate: overridesOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="ml-auto"
                  >
                    <ChevronDown className="w-3.5 h-3.5 text-pi-text-dim" />
                  </motion.div>
                </button>
                <AnimatePresence initial={false}>
                  {overridesOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3 space-y-2">
                        {sections.map((section, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.03, type: 'spring', stiffness: 400, damping: 25 }}
                            className="border border-pi-border rounded-lg bg-pi-surface/30 p-2.5"
                          >
                            <p className="text-[10px] text-pi-text font-mono leading-relaxed whitespace-pre-wrap">
                              {section}
                            </p>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
