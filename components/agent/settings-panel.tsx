'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  Settings, X, Timer, DollarSign, RefreshCw,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { BrainMetaExtended } from '@/hooks/use-agent-state'

/* ─── Props ─────────────────────────────────────── */

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
  brainMeta: BrainMetaExtended | null
}

/* ─── Constants ─────────────────────────────────── */

const POLL_INTERVAL_KEY = 'pi_poll_interval_ms'
const DEFAULT_POLL_MS = 3000
const MIN_WAKE_MIN = 1
const MAX_WAKE_MIN = 60

/* ─── Helpers ───────────────────────────────────── */

function loadPollInterval(): number {
  try {
    const stored = localStorage.getItem(POLL_INTERVAL_KEY)
    if (stored) {
      const val = parseInt(stored, 10)
      if (!isNaN(val) && val >= 1000 && val <= 30000) return val
    }
  } catch { /* localStorage unavailable */ }
  return DEFAULT_POLL_MS
}

function savePollInterval(ms: number) {
  try {
    localStorage.setItem(POLL_INTERVAL_KEY, String(ms))
  } catch { /* localStorage unavailable */ }
}

/* ─── Component ─────────────────────────────────── */

export function SettingsPanel({ open, onClose, brainMeta }: SettingsPanelProps) {
  const currentWakeMin = brainMeta ? Math.round(brainMeta.wakeInterval / 60000) : 5
  const [wakeMin, setWakeMin] = useState(currentWakeMin)
  const [wakeUpdating, setWakeUpdating] = useState(false)
  const [pollMs, setPollMs] = useState(DEFAULT_POLL_MS)

  // Sync wake slider with brainMeta
  useEffect(() => {
    if (brainMeta) {
      setWakeMin(Math.round(brainMeta.wakeInterval / 60000))
    }
  }, [brainMeta?.wakeInterval])

  // Load poll interval from localStorage on mount
  useEffect(() => {
    setPollMs(loadPollInterval())
  }, [])

  const handleWakeChange = useCallback(async (value: number) => {
    setWakeMin(value)
    setWakeUpdating(true)
    try {
      await fetch('/api/brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'update-setting',
          data: { wakeIntervalMs: value * 60000 },
        }),
      })
    } catch { /* ignore */ }
    setWakeUpdating(false)
  }, [])

  const handlePollChange = useCallback((value: number) => {
    setPollMs(value)
    savePollInterval(value)
  }, [])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-pi-overlay z-40"
            onClick={onClose}
          />

          {/* Slide-over panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className="fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-pi-bg border-l border-pi-border shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-pi-border bg-pi-panel/80 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <Settings className="w-3.5 h-3.5 text-pi-accent" />
                <span className="text-xs font-bold text-pi-text">Settings</span>
              </div>
              <button
                onClick={onClose}
                className="w-6 h-6 rounded-md flex items-center justify-center text-pi-text-dim hover:text-pi-text hover:bg-pi-surface transition-all"
                aria-label="Close settings"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">

              {/* Wake Interval */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Timer className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-[11px] font-bold text-pi-text uppercase tracking-wider">Wake Interval</span>
                  {wakeUpdating && (
                    <RefreshCw className="w-2.5 h-2.5 text-pi-accent animate-spin" />
                  )}
                </div>
                <p className="text-[10px] text-pi-text-dim leading-relaxed">
                  How often the brain wakes to think. Lower values = more active, higher cost.
                </p>
                <div className="space-y-1.5">
                  <input
                    type="range"
                    min={MIN_WAKE_MIN}
                    max={MAX_WAKE_MIN}
                    step={1}
                    value={wakeMin}
                    onChange={e => handleWakeChange(Number(e.target.value))}
                    className="w-full h-1.5 bg-pi-surface rounded-full appearance-none cursor-pointer accent-pi-accent
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
                      [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-pi-accent [&::-webkit-slider-thumb]:border-2
                      [&::-webkit-slider-thumb]:border-pi-bg [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                  <div className="flex justify-between">
                    <span className="text-[9px] text-pi-text-dim font-mono">{MIN_WAKE_MIN}m</span>
                    <span className="text-[10px] font-mono font-semibold text-pi-accent">{wakeMin}m</span>
                    <span className="text-[9px] text-pi-text-dim font-mono">{MAX_WAKE_MIN}m</span>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-pi-border/50" />

              {/* Daily Budget */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[11px] font-bold text-pi-text uppercase tracking-wider">Daily Budget</span>
                </div>
                <div className="flex items-center justify-between bg-pi-surface border border-pi-border rounded-lg px-3 py-2.5">
                  <span className="text-[11px] text-pi-text-dim">API cost limit</span>
                  <span className="text-sm font-mono font-bold text-pi-text">$10.00</span>
                </div>
                {brainMeta && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-pi-text-dim">Spent today</span>
                      <span className={cn(
                        'font-mono font-semibold',
                        brainMeta.totalCost > 8 ? 'text-pi-danger' :
                        brainMeta.totalCost > 5 ? 'text-pi-warning' :
                        'text-pi-success'
                      )}>
                        ${brainMeta.totalCost.toFixed(2)}
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full h-1.5 bg-pi-surface rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (brainMeta.totalCost / 10) * 100)}%` }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        className={cn(
                          'h-full rounded-full',
                          brainMeta.totalCost > 8 ? 'bg-pi-danger' :
                          brainMeta.totalCost > 5 ? 'bg-pi-warning' :
                          'bg-pi-success'
                        )}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="border-t border-pi-border/50" />

              {/* Poll Interval (client-side) */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-orange-400" />
                  <span className="text-[11px] font-bold text-pi-text uppercase tracking-wider">Poll Interval</span>
                </div>
                <p className="text-[10px] text-pi-text-dim leading-relaxed">
                  How often the dashboard fetches brain state. Stored in browser only.
                </p>
                <div className="space-y-1.5">
                  <input
                    type="range"
                    min={1000}
                    max={15000}
                    step={500}
                    value={pollMs}
                    onChange={e => handlePollChange(Number(e.target.value))}
                    className="w-full h-1.5 bg-pi-surface rounded-full appearance-none cursor-pointer accent-pi-accent
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
                      [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-pi-accent [&::-webkit-slider-thumb]:border-2
                      [&::-webkit-slider-thumb]:border-pi-bg [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                  <div className="flex justify-between">
                    <span className="text-[9px] text-pi-text-dim font-mono">1s</span>
                    <span className="text-[10px] font-mono font-semibold text-pi-accent">{(pollMs / 1000).toFixed(1)}s</span>
                    <span className="text-[9px] text-pi-text-dim font-mono">15s</span>
                  </div>
                </div>
                <p className="text-[9px] text-pi-text-dim/60 italic">
                  Requires page reload to take effect.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-pi-border bg-pi-panel/50">
              <p className="text-[9px] text-pi-text-dim/40 font-mono text-center">
                Pi-Chi Brain Settings
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
