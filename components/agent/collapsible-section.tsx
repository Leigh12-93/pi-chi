'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

interface CollapsibleSectionProps {
  title: string
  icon: React.ElementType
  defaultOpen?: boolean
  badge?: string | number
  children: React.ReactNode
  className?: string
}

export function CollapsibleSection({
  title, icon: Icon, defaultOpen = true, badge, children, className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={cn('', className)}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-pi-surface/50 transition-colors"
        aria-expanded={open}
        aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
      >
        <Icon className="w-3.5 h-3.5 text-pi-accent shrink-0" />
        <span className="text-[11px] font-bold text-pi-text uppercase tracking-wider">{title}</span>
        {badge !== undefined && badge !== 0 && (
          <span className="text-[9px] text-pi-text-dim bg-pi-surface px-1.5 py-0.5 rounded-full font-mono">
            {badge}
          </span>
        )}
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="ml-auto"
        >
          <ChevronDown className="w-3.5 h-3.5 text-pi-text-dim" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
