'use client'

import { Cpu } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface CapabilitiesPanelProps {
  capabilities: string[]
  className?: string
}

export function CapabilitiesPanel({ capabilities, className }: CapabilitiesPanelProps) {
  return (
    <div className={cn('h-full flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-pi-border bg-pi-panel/80 backdrop-blur-sm">
        <Cpu className="w-3.5 h-3.5 text-pi-accent" />
        <span className="text-xs font-bold text-pi-text">Skills</span>
        <span className="text-[10px] text-pi-text-dim bg-pi-surface px-1.5 py-0.5 rounded-full font-mono">
          {capabilities.length}
        </span>
      </div>

      {/* Skills grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {capabilities.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-12 text-pi-text-dim"
          >
            <Cpu className="w-10 h-10 mb-3 opacity-15" />
            <p className="text-xs font-medium">No skills discovered yet</p>
            <p className="text-[10px] mt-1 text-center max-w-[200px]">
              The brain will discover and catalog its capabilities over time.
            </p>
          </motion.div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {capabilities.map((cap, i) => (
              <motion.span
                key={cap}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.02, type: 'spring', stiffness: 500, damping: 30 }}
                className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-medium bg-pi-surface border border-pi-border text-pi-text-dim hover:text-pi-text hover:border-pi-accent/30 transition-all"
              >
                {cap}
              </motion.span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
